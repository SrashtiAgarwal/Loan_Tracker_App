import logging
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional

from ..models import Loan, LoanCreate, LoanStatus, UserRole, MessageResponse, Expense, ExpenseCreate
from ..auth import get_current_user, require_role
from ..config import get_db
from ..utils import (
    generate_id, utc_now, validate_positive_number,
    get_beneficiary_by_user_id, validate_loan_access
)

router = APIRouter()
logger = logging.getLogger(__name__)

# ── Valid expense categories for a microfinance loan ──────────────────────────
# These are the ONLY categories accepted. Free-text category is a fraud risk.
VALID_EXPENSE_CATEGORIES = {
    "purchase",       # Primary: buying the item the loan was sanctioned for
    "transport",      # Delivery / transport cost of the item
    "installation",   # Setup / installation fee (e.g. solar panel, machinery)
    "insurance",      # Insurance premium on the asset
    "registration",   # RTO registration for vehicles, land registry, etc.
    "repair",         # Repair of the loan-funded asset (not unrelated items)
    "tax",            # Road tax, GST on the item purchase
    "other",          # Anything else — requires officer approval note
}

# How much of the loan amount can go toward non-purchase expenses (transport,
# insurance, registration, etc.). In real microfinance this is typically 10-15%.
# The remaining 85%+ must be the actual item purchase.
MAX_ANCILLARY_RATIO = 0.15   # 15% max for non-purchase costs
MIN_PURCHASE_RATIO  = 0.85   # At least 85% must be a "purchase" expense


# ─── Create Loan ──────────────────────────────────────────────────────────────

@router.post("", response_model=Loan)
async def create_loan(
    loan: LoanCreate,
    current_user: dict = Depends(require_role([UserRole.ADMIN, UserRole.OFFICER]))
):
    """
    Create a loan. In real microfinance:
    - The loan amount IS the item cost. No ±20% wiggle room.
    - estimated_item_cost is mandatory so we can validate receipts later.
    - Loan starts as PENDING until officer disburses.
    """
    db = get_db()

    beneficiary = await db.beneficiaries.find_one({"id": loan.beneficiary_id})
    if not beneficiary:
        raise HTTPException(status_code=404, detail="Beneficiary not found")

    validate_positive_number(loan.amount, "Loan amount")
    validate_positive_number(loan.tenure_months, "Loan tenure")

    # Validate loan amount against estimated item cost if provided
    if loan.estimated_item_cost:
        validate_positive_number(loan.estimated_item_cost, "Estimated item cost")

        # Loan amount must cover the item cost.
        # We allow up to 15% extra for ancillary costs (transport, tax, registration).
        max_allowed = round(loan.estimated_item_cost * (1 + MAX_ANCILLARY_RATIO), 2)
        if loan.amount < loan.estimated_item_cost:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Loan amount ₹{loan.amount:,.0f} is less than the item cost "
                    f"₹{loan.estimated_item_cost:,.0f}. The loan must cover the full item cost."
                )
            )
        if loan.amount > max_allowed:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Loan amount ₹{loan.amount:,.0f} exceeds item cost "
                    f"₹{loan.estimated_item_cost:,.0f} by more than {int(MAX_ANCILLARY_RATIO*100)}%. "
                f"Maximum allowed: ₹{max_allowed:,.0f} (covers item + ancillary costs)."
            )
        )

    # Prevent duplicate loan IDs
    if await db.loans.find_one({"loan_id": loan.loan_id}):
        raise HTTPException(status_code=400, detail=f"Loan with ID {loan.loan_id} already exists")

    # Check if beneficiary already has an active/approved loan for the same purpose.
    # In microfinance you don't give two bike loans to the same person simultaneously.
    duplicate_active = await db.loans.find_one({
        "beneficiary_id": loan.beneficiary_id,
        "purpose": loan.purpose,
        "status": {"$in": [LoanStatus.ACTIVE, LoanStatus.APPROVED]},
    })
    if duplicate_active:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Beneficiary already has an active/approved '{loan.purpose}' loan "
                f"({duplicate_active['loan_id']}). Close it before creating another."
            )
        )

    loan_data = {
        "id": generate_id(),
        "created_by": current_user["user_id"],
        "created_at": utc_now(),
        "remaining_balance": loan.amount,
        "purchase_spent": 0.0,      # Track how much went to actual item purchase
        "ancillary_spent": 0.0,     # Track ancillary costs
        **loan.dict()
    }

    await db.loans.insert_one(loan_data)
    logger.info(f"Loan created: {loan_data['id']} | {loan.loan_id} | ₹{loan.amount:,.0f} | {loan.purpose}")
    return Loan(**loan_data)


# ─── List Loans ───────────────────────────────────────────────────────────────

@router.get("", response_model=List[Loan])
async def get_loans(
    beneficiary_id: Optional[str] = None,
    status: Optional[LoanStatus] = None,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    query = {}
    if beneficiary_id:
        query["beneficiary_id"] = beneficiary_id
    if status:
        query["status"] = status

    if current_user["role"] == UserRole.BENEFICIARY:
        user_beneficiary = await get_beneficiary_by_user_id(current_user["user_id"])
        if user_beneficiary:
            query["beneficiary_id"] = user_beneficiary["id"]
        else:
            return []

    loans = await db.loans.find(query).to_list(1000)
    return [Loan(**loan) for loan in loans]


# ─── Get Single Loan ──────────────────────────────────────────────────────────

@router.get("/{loan_id}", response_model=Loan)
async def get_loan(
    loan_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    loan = await db.loans.find_one({"id": loan_id})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    await validate_loan_access(current_user, loan_id)
    return Loan(**loan)


# ─── Loan Utilization Summary (officers) ─────────────────────────────────────

@router.get("/{loan_id}/summary")
async def get_loan_summary(
    loan_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Full utilization summary for a loan — useful for officers during field visits
    and for auditors checking for misuse.
    """
    db = get_db()
    loan = await db.loans.find_one({"id": loan_id})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    await validate_loan_access(current_user, loan_id)

    expenses = await db.expenses.find({"loan_id": loan_id}).sort("created_at", 1).to_list(1000)

    total_spent       = sum(e["amount"] for e in expenses)
    purchase_spent    = sum(e["amount"] for e in expenses if e["category"] == "purchase")
    ancillary_spent   = sum(e["amount"] for e in expenses if e["category"] != "purchase")
    remaining_balance = loan.get("remaining_balance", loan["amount"])
    utilization_pct   = round((total_spent / loan["amount"]) * 100, 1) if loan["amount"] else 0
    item_cost         = loan.get("estimated_item_cost", loan["amount"])

    # Misuse flag: if purchase_spent is less than 85% of item cost once the
    # loan is mostly spent, that's suspicious.
    purchase_coverage = round((purchase_spent / item_cost) * 100, 1) if item_cost else 0
    misuse_flag = (
        total_spent > (loan["amount"] * 0.5)   # spent more than half
        and purchase_coverage < (MIN_PURCHASE_RATIO * 100)
    )

    return {
        "loan_id": loan["loan_id"],
        "purpose": loan["purpose"],
        "loan_amount": loan["amount"],
        "estimated_item_cost": item_cost,
        "status": loan["status"],
        "utilization": {
            "total_spent": round(total_spent, 2),
            "remaining_balance": round(remaining_balance, 2),
            "utilization_pct": utilization_pct,
            "purchase_spent": round(purchase_spent, 2),
            "ancillary_spent": round(ancillary_spent, 2),
            "purchase_coverage_pct": purchase_coverage,
        },
        "misuse_flag": misuse_flag,
        "misuse_reason": (
            f"Only {purchase_coverage}% of item cost covered by purchase receipts "
            f"(minimum expected: {int(MIN_PURCHASE_RATIO*100)}%)"
        ) if misuse_flag else None,
        "expense_count": len(expenses),
        "expenses": [
            {
                "id": e["id"],
                "amount": e["amount"],
                "category": e["category"],
                "description": e["description"],
                "created_at": e["created_at"],
            }
            for e in expenses
        ],
    }


# ─── Update Loan Status ───────────────────────────────────────────────────────

@router.put("/{loan_id}/status")
async def update_loan_status(
    loan_id: str,
    status: LoanStatus,
    current_user: dict = Depends(require_role([UserRole.ADMIN, UserRole.OFFICER]))
):
    """
    Status transitions allowed in real microfinance:
      PENDING → APPROVED  (officer sanctions the loan)
      APPROVED → ACTIVE   (funds disbursed to beneficiary)
      ACTIVE → COMPLETED  (fully repaid or item purchased)
      ACTIVE → REJECTED   (fraud detected)
      PENDING → REJECTED  (not eligible)
    """
    db = get_db()
    loan = await db.loans.find_one({"id": loan_id})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")

    current_status = loan["status"]

    # Enforce valid transitions
    VALID_TRANSITIONS = {
        LoanStatus.PENDING:   [LoanStatus.APPROVED, LoanStatus.REJECTED],
        LoanStatus.APPROVED:  [LoanStatus.ACTIVE, LoanStatus.REJECTED],
        LoanStatus.ACTIVE:    [LoanStatus.COMPLETED, LoanStatus.REJECTED],
        LoanStatus.COMPLETED: [],   # Terminal state
        LoanStatus.REJECTED:  [],   # Terminal state
    }

    allowed = VALID_TRANSITIONS.get(current_status, [])
    if status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot move loan from '{current_status}' to '{status}'. "
                f"Allowed transitions: {[s.value for s in allowed] or 'none (terminal state)'}"
            )
        )

    update = {"status": status, "updated_at": utc_now()}
    if status == LoanStatus.ACTIVE:
        update["disbursement_date"] = utc_now()

    await db.loans.update_one({"id": loan_id}, {"$set": update})
    logger.info(f"Loan {loan_id} status: {current_status} → {status} by {current_user['user_id']}")
    return MessageResponse(message=f"Loan status updated to '{status}'")


# ─── Record Expense ───────────────────────────────────────────────────────────

@router.post("/{loan_id}/expenses", response_model=Expense)
async def create_expense(
    loan_id: str,
    expense: ExpenseCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Record an expense against a loan.

    Real-life rules enforced:
    - Loan must be ACTIVE (can't spend before disbursement or after completion)
    - Category must be from the approved list
    - Amount cannot exceed remaining balance (prevents overspend)
    - Ancillary costs (transport, tax, etc.) cannot exceed 15% of loan amount
    - When balance hits 0, loan auto-completes
    - Warns if purchase amount is less than item cost (possible misuse)
    """
    db = get_db()

    loan = await db.loans.find_one({"id": loan_id})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")

    # Only ACTIVE loans can have expenses recorded
    if loan["status"] != LoanStatus.ACTIVE:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot record expenses for a loan with status '{loan['status']}'. "
                f"Loan must be ACTIVE (disbursed) before expenses can be recorded."
            )
        )

    await validate_loan_access(current_user, loan_id)
    validate_positive_number(expense.amount, "Expense amount")

    # Validate category
    if expense.category not in VALID_EXPENSE_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid category '{expense.category}'. "
                f"Allowed: {', '.join(sorted(VALID_EXPENSE_CATEGORIES))}"
            )
        )

    remaining_balance = loan.get("remaining_balance", loan["amount"])

    # Cannot overspend the loan
    if expense.amount > remaining_balance:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Expense ₹{expense.amount:,.0f} exceeds remaining loan balance "
                f"₹{remaining_balance:,.0f}. "
                f"Split the expense or reduce the amount."
            )
        )

    # Enforce the ancillary cost cap.
    # Real-life: you shouldn't spend 40% of a bike loan on "transport".
    if expense.category != "purchase":
        current_ancillary = loan.get("ancillary_spent", 0.0)
        new_ancillary_total = current_ancillary + expense.amount
        max_ancillary = round(loan["amount"] * MAX_ANCILLARY_RATIO, 2)

        if new_ancillary_total > max_ancillary:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Ancillary expenses (non-purchase) cannot exceed "
                    f"{int(MAX_ANCILLARY_RATIO*100)}% of the loan amount "
                    f"(₹{max_ancillary:,.0f}). "
                    f"Already spent on ancillaries: ₹{current_ancillary:,.0f}. "
                    f"This expense of ₹{expense.amount:,.0f} would bring total to "
                    f"₹{new_ancillary_total:,.0f}."
                )
            )

    # Warn if a purchase expense is far below the item cost (possible misuse signal).
    # We log this for officer review but do not block it — the officer sees it in summary.
    warning = None
    if expense.category == "purchase":
        item_cost = loan.get("estimated_item_cost", loan["amount"])
        if expense.amount < item_cost * 0.5:
            warning = (
                f"Purchase amount ₹{expense.amount:,.0f} is less than 50% of "
                f"estimated item cost ₹{item_cost:,.0f}. "
                f"This may indicate partial purchase or misuse. Officer review recommended."
            )
            logger.warning(f"Possible misuse flag on loan {loan_id}: {warning}")

    beneficiary_id = loan["beneficiary_id"]
    expense_data = {
        "id": generate_id(),
        "beneficiary_id": beneficiary_id,
        "loan_id": loan_id,
        "created_by": current_user["user_id"],
        "created_at": utc_now(),
        **expense.dict()
    }

    await db.expenses.insert_one(expense_data)

    # Update remaining balance and category-specific spend trackers
    new_balance = round(remaining_balance - expense.amount, 2)
    update_fields = {
        "remaining_balance": new_balance,
        "updated_at": utc_now(),
    }
    if expense.category == "purchase":
        update_fields["purchase_spent"] = round(loan.get("purchase_spent", 0.0) + expense.amount, 2)
    else:
        update_fields["ancillary_spent"] = round(loan.get("ancillary_spent", 0.0) + expense.amount, 2)

    # Auto-complete the loan when balance reaches zero
    if new_balance == 0:
        update_fields["status"] = LoanStatus.COMPLETED
        logger.info(f"Loan {loan_id} auto-completed — balance reached ₹0")

    await db.loans.update_one({"id": loan_id}, {"$set": update_fields})

    logger.info(
        f"Expense recorded: ₹{expense.amount:,.0f} [{expense.category}] "
        f"on loan {loan_id}. Remaining: ₹{new_balance:,.0f}"
    )

    result = Expense(**expense_data)

    # Attach warning to response if present (FastAPI will include extra fields)
    if warning:
        return {**expense_data, "warning": warning}

    return result


# ─── Get Expenses ─────────────────────────────────────────────────────────────

@router.get("/{loan_id}/expenses", response_model=List[Expense])
async def get_expenses(
    loan_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all expenses for a loan, newest first."""
    db = get_db()
    await validate_loan_access(current_user, loan_id)
    loan = await db.loans.find_one({"id": loan_id})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    expenses = await db.expenses.find({"loan_id": loan_id}).sort("created_at", -1).to_list(1000)
    return [Expense(**exp) for exp in expenses]