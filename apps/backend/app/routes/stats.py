from fastapi import APIRouter, Depends
from ..models import UserRole, LoanStatus
from ..auth import get_current_user
from ..config import get_db

router = APIRouter()

@router.get("/dashboard")
async def get_dashboard_stats(
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    stats = {}
    
    if current_user["role"] in [UserRole.ADMIN, UserRole.OFFICER]:
        stats["total_beneficiaries"] = await db.beneficiaries.count_documents({})
        stats["total_loans"] = await db.loans.count_documents({})
        stats["active_loans"] = await db.loans.count_documents({"status": LoanStatus.ACTIVE})
        stats["total_uploads"] = await db.media_uploads.count_documents({})
        stats["pending_review"] = await db.media_uploads.count_documents({
            "id": {"$nin": await db.approvals.distinct("media_id")}
        })
    else:
        beneficiary = await db.beneficiaries.find_one({"user_id": current_user["user_id"]})
        if beneficiary:
            stats["my_loans"] = await db.loans.count_documents({"beneficiary_id": beneficiary["id"]})
            stats["my_uploads"] = await db.media_uploads.count_documents({"beneficiary_id": beneficiary["id"]})
    
    return stats
