from fastapi import APIRouter, Depends
from typing import List, Optional
from datetime import datetime

from ..models import UserRole
from ..auth import get_current_user, require_role
from ..config import get_db

router = APIRouter()

async def log_audit(
    action: str,
    entity_type: str,
    entity_id: str,
    user_id: str,
    user_role: str,
    details: Optional[dict] = None
):
    """
    Log an audit event to the database
    """
    db = get_db()
    audit_log = {
        "action": action,  # CREATE, UPDATE, DELETE, APPROVE, REJECT, etc.
        "entity_type": entity_type,  # beneficiary, loan, media, approval, etc.
        "entity_id": entity_id,
        "user_id": user_id,
        "user_role": user_role,
        "details": details or {},
        "timestamp": datetime.utcnow(),
    }
    await db.audit_logs.insert_one(audit_log)

@router.get("")
async def get_audit_logs(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    user_id: Optional[str] = None,
    limit: int = 100,
    current_user: dict = Depends(require_role([UserRole.ADMIN, UserRole.OFFICER]))
):
    """
    Get audit logs with optional filters (Admin/Officer only)
    """
    db = get_db()
    query = {}
    
    if entity_type:
        query["entity_type"] = entity_type
    if entity_id:
        query["entity_id"] = entity_id
    if user_id:
        query["user_id"] = user_id
    
    logs = await db.audit_logs.find(query).sort("timestamp", -1).limit(limit).to_list(limit)
    return logs

@router.get("/recent")
async def get_recent_audit_logs(
    limit: int = 50,
    current_user: dict = Depends(require_role([UserRole.ADMIN]))
):
    """
    Get recent audit logs (Admin only)
    """
    db = get_db()
    logs = await db.audit_logs.find({}).sort("timestamp", -1).limit(limit).to_list(limit)
    return logs

@router.get("/stats")
async def get_audit_stats(
    current_user: dict = Depends(require_role([UserRole.ADMIN]))
):
    """
    Get audit statistics (Admin only)
    """
    db = get_db()
    
    total_logs = await db.audit_logs.count_documents({})
    
    # Count by action type
    pipeline = [
        {"$group": {"_id": "$action", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    action_counts = await db.audit_logs.aggregate(pipeline).to_list(100)
    
    # Count by entity type
    pipeline = [
        {"$group": {"_id": "$entity_type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    entity_counts = await db.audit_logs.aggregate(pipeline).to_list(100)
    
    return {
        "total_logs": total_logs,
        "by_action": action_counts,
        "by_entity": entity_counts,
    }
