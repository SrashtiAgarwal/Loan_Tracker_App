from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional

from ..models import Approval, ApprovalCreate, ApprovalStatus, UserRole
from ..auth import get_current_user, require_role
from ..config import get_db
from ..utils import generate_id, utc_now

router = APIRouter()

@router.post("", response_model=Approval)
async def create_approval(
    approval: ApprovalCreate,
    current_user: dict = Depends(require_role([UserRole.OFFICER, UserRole.ADMIN]))
):
    db = get_db()
    
    # Validate media exists
    media = await db.media_uploads.find_one({"id": approval.media_id})
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    
    # Check if already approved by this officer
    existing_approval = await db.approvals.find_one({
        "media_id": approval.media_id,
        "officer_id": current_user["user_id"]
    })
    if existing_approval:
        raise HTTPException(
            status_code=400,
            detail="You have already reviewed this media"
        )
    
    user = await db.users.find_one({"id": current_user["user_id"]})
    officer_name = user.get("name") or user.get("phone_number")
    
    approval_data = {
        "id": generate_id(),
        "officer_id": current_user["user_id"],
        "officer_name": officer_name,
        "approved_at": utc_now(),
        **approval.dict()
    }
    
    await db.approvals.insert_one(approval_data)
    return Approval(**approval_data)

@router.get("", response_model=List[Approval])
async def get_approvals(
    media_id: Optional[str] = None,
    status: Optional[ApprovalStatus] = None,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    query = {}
    if media_id:
        query["media_id"] = media_id
    if status:
        query["status"] = status
    
    approvals = await db.approvals.find(query).sort("approved_at", -1).to_list(1000)
    return [Approval(**approval) for approval in approvals]

