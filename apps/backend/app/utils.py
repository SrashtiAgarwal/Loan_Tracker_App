"""
Utility functions for common operations
Reduces code duplication across the application
"""

import uuid
from datetime import datetime
from typing import Optional, Dict, Any
from fastapi import HTTPException

from app.config import get_db
from app.models import UserRole


def normalize_phone_number(phone: str) -> str:
    """
    Normalize phone number to +91XXXXXXXXXX format.
    - If starts with +91, keep as is
    - If starts with 0, convert to +91
    - If 10 digits without country code, add +91
    """
    phone = phone.strip()
    if phone.startswith('+91'):
        return phone
    if phone.startswith('0'):
        return '+91' + phone[1:]
    if len(phone) == 10 and phone.isdigit():
        return '+91' + phone
    return phone


def generate_id() -> str:
    """Generate a unique UUID string"""
    return str(uuid.uuid4())


def utc_now() -> datetime:
    """Get current UTC datetime"""
    return datetime.utcnow()


async def get_beneficiary_by_user_id(user_id: str) -> Optional[Dict[str, Any]]:
    """
    Get beneficiary document by user_id
    Common operation used across multiple routes
    Falls back to phone number search if user_id link is missing
    """
    db = get_db()

    # First try to find by user_id (proper link)
    beneficiary = await db.beneficiaries.find_one({"user_id": user_id})

    # Fallback: search by phone number if user_id link is missing
    if not beneficiary:
        user = await db.users.find_one({"id": user_id})
        if user:
            beneficiary = await db.beneficiaries.find_one({"phone_number": user["phone_number"]})

    return beneficiary


async def validate_beneficiary_access(current_user: dict, beneficiary_id: str) -> None:
    """
    Validate that a beneficiary user can only access their own data
    Raises HTTPException if access denied
    """
    if current_user["role"] == UserRole.BENEFICIARY:
        db = get_db()
        beneficiary = await db.beneficiaries.find_one({"id": beneficiary_id})
        if not beneficiary or beneficiary.get("user_id") != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="Access denied")


async def validate_loan_access(current_user: dict, loan_id: str) -> None:
    """
    Validate that a beneficiary user can only access their own loans
    Raises HTTPException if access denied
    """
    if current_user["role"] == UserRole.BENEFICIARY:
        db = get_db()
        loan = await db.loans.find_one({"id": loan_id})
        if not loan:
            raise HTTPException(status_code=404, detail="Loan not found")
        
        beneficiary = await get_beneficiary_by_user_id(current_user["user_id"])
        if not beneficiary or loan["beneficiary_id"] != beneficiary["id"]:
            raise HTTPException(status_code=403, detail="Access denied")


async def get_user_beneficiary_id(user_id: str) -> Optional[str]:
    """
    Get beneficiary ID for a given user ID
    Returns None if no beneficiary found
    """
    beneficiary = await get_beneficiary_by_user_id(user_id)
    return beneficiary["id"] if beneficiary else None


def format_phone_number(phone: str) -> str:
    """
    Normalize phone number to consistent format
    Removes non-digit characters and adds country code
    """
    import re
    digits = re.sub(r'\D', '', phone)
    
    if digits.startswith('91') and len(digits) == 12:
        return f"+{digits}"
    elif len(digits) == 10:
        return f"+91{digits}"
    elif phone.startswith('+91'):
        return phone
    return phone


def validate_positive_number(value: float, field_name: str) -> None:
    """Validate that a number is positive"""
    if value <= 0:
        raise HTTPException(
            status_code=400,
            detail=f"{field_name} must be positive"
        )


def validate_aadhaar(aadhaar: Optional[str]) -> None:
    """Validate Aadhaar number format (12 digits)"""
    if aadhaar:
        clean_aadhaar = aadhaar.replace(" ", "").replace("-", "")
        if len(clean_aadhaar) != 12 or not clean_aadhaar.isdigit():
            raise HTTPException(
                status_code=400,
                detail="Invalid Aadhaar number. Must be 12 digits"
            )


def validate_phone_number(phone: str) -> None:
    """Validate phone number format"""
    if not phone or len(phone) < 10:
        raise HTTPException(status_code=400, detail="Invalid phone number")
