from fastapi import APIRouter, HTTPException, Depends
from typing import List

from ..models import Beneficiary, BeneficiaryCreate, UserRole
from ..auth import get_current_user, require_role
from ..config import get_db
from ..utils import (
    generate_id, utc_now, validate_phone_number,
    validate_aadhaar, validate_beneficiary_access, normalize_phone_number
)

router = APIRouter()

@router.post("", response_model=Beneficiary)
async def create_beneficiary(
    beneficiary: BeneficiaryCreate,
    current_user: dict = Depends(require_role([UserRole.ADMIN, UserRole.OFFICER]))
):
    db = get_db()

    # Normalize phone number to consistent format
    normalized_phone = normalize_phone_number(beneficiary.phone_number)

    # Validate inputs
    validate_phone_number(normalized_phone)
    validate_aadhaar(beneficiary.aadhaar)

    # Check for duplicate
    existing = await db.beneficiaries.find_one({"phone_number": normalized_phone})
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Beneficiary with phone number {normalized_phone} already exists"
        )

    # Link to existing user or create new user
    user_doc = await db.users.find_one({"phone_number": normalized_phone})
    user_id = None

    if user_doc:
        user_id = user_doc["id"]
        # Update user role if it's not beneficiary
        if user_doc["role"] != UserRole.BENEFICIARY:
            await db.users.update_one(
                {"id": user_doc["id"]},
                {"$set": {"role": UserRole.BENEFICIARY}}
            )
    else:
        # Create new user account for the beneficiary
        user_id = generate_id()
        user_data = {
            "id": user_id,
            "phone_number": normalized_phone,
            "role": UserRole.BENEFICIARY,
            "name": beneficiary.name,
            "created_at": utc_now(),
            "fcm_token": None,
        }
        await db.users.insert_one(user_data)

    beneficiary_data = {
    **beneficiary.dict(),                        # spread first (original phone_number)
    "id": generate_id(),
    "user_id": user_id,
    "phone_number": normalized_phone,            # overwrite with normalized ✅
    "created_by": current_user["user_id"],
    "created_at": utc_now(),
}

    # Use try-except to handle potential duplicate key errors
    try:
        await db.beneficiaries.insert_one(beneficiary_data)
    except Exception as e:
        # Check if it's a duplicate error (MongoDB error code 11000)
        if "duplicate" in str(e).lower() or "11000" in str(e):
            existing = await db.beneficiaries.find_one({"phone_number": normalized_phone})
            if existing:
                return Beneficiary(**existing)
        raise
    return Beneficiary(**beneficiary_data)

@router.get("", response_model=List[Beneficiary])
async def get_beneficiaries(current_user: dict = Depends(get_current_user)):
    db = get_db()
    query = {"user_id": current_user["user_id"]} if current_user["role"] == UserRole.BENEFICIARY else {}
    beneficiaries = await db.beneficiaries.find(query).to_list(1000)
    # Filter out documents missing required fields (legacy data)
    valid_beneficiaries = [b for b in beneficiaries if "phone_number" in b and "name" in b]
    return [Beneficiary(**b) for b in valid_beneficiaries]

@router.get("/{beneficiary_id}", response_model=Beneficiary)
async def get_beneficiary(
    beneficiary_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    beneficiary = await db.beneficiaries.find_one({"id": beneficiary_id})
    if not beneficiary:
        raise HTTPException(status_code=404, detail="Beneficiary not found")
    
    # Check for missing required fields (legacy data)
    if "phone_number" not in beneficiary or "name" not in beneficiary:
        raise HTTPException(status_code=404, detail="Beneficiary data is incomplete")
    
    await validate_beneficiary_access(current_user, beneficiary_id)
    return Beneficiary(**beneficiary)

@router.put("/{beneficiary_id}", response_model=Beneficiary)
async def update_beneficiary(
    beneficiary_id: str,
    beneficiary: BeneficiaryCreate,
    current_user: dict = Depends(require_role([UserRole.ADMIN, UserRole.OFFICER]))
):
    db = get_db()
    update_data = {**beneficiary.dict(), "updated_at": utc_now()}

    result = await db.beneficiaries.update_one(
        {"id": beneficiary_id},
        {"$set": update_data}
    )

    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Beneficiary not found")

    updated = await db.beneficiaries.find_one({"id": beneficiary_id})
    return Beneficiary(**updated)

@router.post("/link-user", response_model=Beneficiary)
async def link_user_to_beneficiary(
    phone_number: str,
    current_user: dict = Depends(require_role([UserRole.ADMIN, UserRole.OFFICER]))
):
    """
    Link an existing user account to a beneficiary profile.
    This is needed when a beneficiary logs in via OTP before the officer creates their profile.
    """
    db = get_db()

    # Find user by phone number
    user = await db.users.find_one({"phone_number": phone_number})
    if not user:
        raise HTTPException(status_code=404, detail="User not found with this phone number")

    if user["role"] != UserRole.BENEFICIARY:
        raise HTTPException(status_code=400, detail="User is not a beneficiary")

    # Find beneficiary profile by phone number
    beneficiary = await db.beneficiaries.find_one({"phone_number": phone_number})
    if not beneficiary:
        raise HTTPException(status_code=404, detail="Beneficiary profile not found with this phone number")

    # Update beneficiary profile with user_id
    result = await db.beneficiaries.update_one(
        {"id": beneficiary["id"]},
        {"$set": {"user_id": user["id"], "updated_at": utc_now()}}
    )

    if result.modified_count == 0:
        raise HTTPException(status_code=500, detail="Failed to link user to beneficiary")

    updated = await db.beneficiaries.find_one({"id": beneficiary["id"]})
    if not updated or "phone_number" not in updated or "name" not in updated:
        raise HTTPException(status_code=500, detail="Beneficiary data is incomplete after linking")
    return Beneficiary(**updated)

    return Beneficiary(**updated)

