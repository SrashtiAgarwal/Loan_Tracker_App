"""
Twilio Verify OTP Service

Twilio Verify handles:
  - OTP generation (no in-memory storage needed)
  - SMS delivery
  - OTP verification with expiry + rate-limiting built-in

Required .env keys:
    TWILIO_ACCOUNT_SID
    TWILIO_AUTH_TOKEN
    TWILIO_VERIFY_SERVICE_SID
"""

import os
import logging
from typing import Dict, Any

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ─── Credentials (loaded once at import time) ─────────────────────────────────

ACCOUNT_SID: str = os.getenv("TWILIO_ACCOUNT_SID", "")
AUTH_TOKEN:  str = os.getenv("TWILIO_AUTH_TOKEN",  "")
VERIFY_SID:  str = os.getenv("TWILIO_VERIFY_SERVICE_SID", "")


def _get_client():
    """Lazily import and construct the Twilio client.

    Lazy import keeps app startup fast and allows the server to boot even if
    the twilio package is not yet installed (will raise at call time instead).
    """
    try:
        from twilio.rest import Client  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "twilio package is not installed. Run: pip install twilio"
        ) from exc

    if not ACCOUNT_SID or not AUTH_TOKEN or not VERIFY_SID:
        raise RuntimeError(
            "Twilio credentials are not configured. "
            "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and "
            "TWILIO_VERIFY_SERVICE_SID in your .env file."
        )

    return Client(ACCOUNT_SID, AUTH_TOKEN)


# ─── Public API ───────────────────────────────────────────────────────────────

def send_otp(phone_number: str) -> Dict[str, Any]:
    """
    Trigger an OTP SMS via the Twilio Verify API.

    Args:
        phone_number: E.164-formatted number, e.g. "+919876543210"

    Returns:
        {"success": True, "sid": "<verification SID>"}

    Raises:
        HTTPException-friendly exceptions on Twilio errors — callers should
        catch generic Exception and wrap into HTTPException.
    """
    try:
        client = _get_client()
        verification = (
            client.verify
                  .v2
                  .services(VERIFY_SID)
                  .verifications
                  .create(to=phone_number, channel="sms")
        )
        logger.info(
            f"✅ Twilio Verify: OTP dispatched to {phone_number} "
            f"(status={verification.status}, sid={verification.sid})"
        )
        return {"success": True, "sid": verification.sid}

    except Exception as exc:
        # Re-map Twilio-specific errors to friendlier messages where possible.
        error_msg = str(exc)

        if "60200" in error_msg:
            raise ValueError("Invalid phone number format. Use international format (+91XXXXXXXXXX).")
        if "60203" in error_msg:
            raise ValueError("Max send attempts reached. Please wait before requesting another OTP.")
        if "60410" in error_msg:
            raise ValueError("Twilio Verify service is not active. Contact support.")

        logger.error(f"❌ Twilio send_otp failed for {phone_number}: {error_msg}")
        raise RuntimeError(f"Failed to send OTP: {error_msg}")


def verify_otp(phone_number: str, otp_code: str) -> Dict[str, Any]:
    """
    Check a submitted OTP code against the Twilio Verify API.

    Args:
        phone_number: E.164-formatted number that received the OTP.
        otp_code:     The 6-digit code submitted by the user.

    Returns:
        {"success": True, "status": "approved"} on success.

    Raises:
        ValueError for known invalid-code / expired / too-many-attempts cases.
        RuntimeError for unexpected Twilio errors.
    """
    try:
        client = _get_client()
        check = (
            client.verify
                  .v2
                  .services(VERIFY_SID)
                  .verification_checks
                  .create(to=phone_number, code=otp_code)
        )

        logger.info(
            f"Twilio Verify check for {phone_number}: status={check.status}"
        )

        if check.status == "approved":
            return {"success": True, "status": "approved"}

        # "pending" means wrong code; Twilio also handles attempt limiting
        raise ValueError("Invalid OTP. Please try again.")

    except ValueError:
        raise  # already a clean message — let the caller re-raise as 400

    except Exception as exc:
        error_msg = str(exc)

        if "60202" in error_msg:
            raise ValueError("Maximum check attempts reached. Please request a new OTP.")
        if "20404" in error_msg:
            # Twilio returns 20404 when the verification does not exist
            # (code already used, expired, or never sent)
            raise ValueError("OTP has expired or was already used. Please request a new OTP.")
        if "60200" in error_msg:
            raise ValueError("Invalid phone number format.")

        logger.error(f"❌ Twilio verify_otp failed for {phone_number}: {error_msg}")
        raise RuntimeError(f"OTP verification failed: {error_msg}")


def is_configured() -> bool:
    """Return True when all three Twilio env vars are present."""
    return bool(ACCOUNT_SID and AUTH_TOKEN and VERIFY_SID)
