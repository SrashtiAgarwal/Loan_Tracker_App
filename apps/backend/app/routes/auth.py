"""
Auth Routes — OTP-based phone authentication via Twilio Verify.

Endpoints:
    POST /api/auth/send-otp   → trigger an SMS OTP
    POST /api/auth/verify-otp → verify the code and return a JWT
    GET  /api/auth/me         → return the currently authenticated user
"""

import logging
from fastapi import APIRouter, HTTPException, Depends

from ..models import (
    OTPRequest, OTPVerify, MessageResponse, TokenResponse, User, UserRole
)
from ..auth import create_access_token, get_current_user
from ..config import get_db
from app.utils import format_phone_number, generate_id, utc_now, normalize_phone_number
from ..services.twilio_service import send_otp as twilio_send, verify_otp as twilio_verify

router = APIRouter()
logger = logging.getLogger(__name__)

# ─── Send OTP ─────────────────────────────────────────────────────────────────

@router.post("/send-otp", response_model=MessageResponse)
async def send_otp(request: OTPRequest):
    """
    Trigger an OTP SMS to the supplied phone number via Twilio Verify.

    The OTP is generated and managed entirely by Twilio — no in-memory
    storage is required on our side.

    Returns a simple success message.  The OTP is NOT included in the
    response (Twilio delivers it via SMS to the user's handset).
    """
    phone_number = format_phone_number(request.phone_number)
    logger.info(f"OTP requested for {phone_number}")

    try:
        twilio_send(phone_number)
    except ValueError as exc:
        # Validation / rate-limit errors → 400 Bad Request
        logger.warning(f"OTP send rejected for {phone_number}: {exc}")
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        # Twilio connectivity / config errors → 503
        logger.error(f"OTP send failed for {phone_number}: {exc}")
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.error(f"Unexpected error sending OTP to {phone_number}: {exc}")
        raise HTTPException(status_code=500, detail="Failed to send OTP. Please try again.")

    logger.info(f"✅ OTP SMS dispatched to {phone_number}")
    return MessageResponse(
        message="OTP sent successfully. Please check your SMS.",
        data={"phone": phone_number}
    )


# ─── Verify OTP ───────────────────────────────────────────────────────────────

@router.post("/verify-otp", response_model=TokenResponse)
async def verify_otp(request: OTPVerify):
    """
    Verify the OTP submitted by the user against Twilio Verify.

    On success:
      • Finds or creates the user in MongoDB.
      • Issues a JWT access token.
      • Returns the token and user object.

    Possible error codes:
      400 — Invalid or expired OTP
      429 — Too many failed attempts (Twilio-enforced)
      500 — Unexpected server error
    """
    db = get_db()
    phone_number = format_phone_number(request.phone_number)
    normalized_phone = normalize_phone_number(phone_number)

    # ── 1. Verify OTP with Twilio ──────────────────────────────────────────
    try:
        twilio_verify(phone_number, request.otp)
    except ValueError as exc:
        # Map the error message to the right HTTP status
        msg = str(exc).lower()
        if "maximum" in msg or "attempts" in msg:
            raise HTTPException(status_code=429, detail=str(exc))
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        logger.error(f"OTP verification runtime error for {phone_number}: {exc}")
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.error(f"Unexpected OTP verification error for {phone_number}: {exc}")
        raise HTTPException(status_code=500, detail="OTP verification failed. Please try again.")

    # ── 2. Find or create user ────────────────────────────────────────────
    try:
        user_doc = await db.users.find_one({"phone_number": normalized_phone})

        if not user_doc:
            user_id   = generate_id()
            user_data = {
                "id":           user_id,
                "phone_number": normalized_phone,
                "role":         request.role or UserRole.BENEFICIARY,
                "name":         request.name or None,
                "created_at":   utc_now(),
                "fcm_token":    None,
            }
            await db.users.insert_one(user_data)
            user_doc = user_data
            logger.info(f"New user registered: {user_id} ({phone_number}) as {user_data['role']}")

        elif request.name and not user_doc.get("name"):
            # First login where user sets their name
            await db.users.update_one(
                {"id": user_doc["id"]},
                {"$set": {"name": request.name}}
            )
            user_doc["name"] = request.name
            logger.info(f"Updated name for user: {user_doc['id']}")

    except Exception as exc:
        logger.error(f"Database error during login for {phone_number}: {exc}")
        raise HTTPException(status_code=500, detail="Database error. Please try again.")

    # ── 3. Issue JWT ──────────────────────────────────────────────────────
    access_token = create_access_token(
        data={
            "user_id":      user_doc["id"],
            "phone_number": user_doc["phone_number"],
            "role":         user_doc["role"],
        }
    )

    user = User(**user_doc)
    logger.info(f"✅ User authenticated: {user.id} (role={user.role})")
    return TokenResponse(access_token=access_token, user=user)


# ─── Get Current User ─────────────────────────────────────────────────────────

@router.get("/me", response_model=User)
async def get_me(current_user: dict = Depends(get_current_user)):
    """Return the profile of the currently authenticated user."""
    db = get_db()
    user_doc = await db.users.find_one({"id": current_user["user_id"]})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found.")
    return User(**user_doc)
