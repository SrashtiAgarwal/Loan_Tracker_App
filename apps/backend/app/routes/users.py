from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional

from ..models import User, UserRole, MessageResponse
from ..auth import get_current_user, require_role
from ..config import get_db

router = APIRouter()

@router.get("", response_model=List[User])
async def get_users(
    role: Optional[UserRole] = None,
    current_user: dict = Depends(require_role([UserRole.ADMIN, UserRole.OFFICER]))
):
    db = get_db()
    query = {}
    if role:
        query["role"] = role
    users = await db.users.find(query).to_list(1000)
    return [User(**user) for user in users]

@router.put("/{user_id}/role")
async def update_user_role(
    user_id: str,
    role: UserRole,
    current_user: dict = Depends(require_role([UserRole.ADMIN]))
):
    db = get_db()
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {"role": role}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return MessageResponse(message="User role updated successfully")

@router.put("/me/name")
async def update_my_name(
    name: str,
    current_user: dict = Depends(get_current_user)
):
    """Update current user's name"""
    db = get_db()
    result = await db.users.update_one(
        {"id": current_user["user_id"]},
        {"$set": {"name": name}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return MessageResponse(message="Name updated successfully")
