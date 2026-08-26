from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from typing import List, Optional
from datetime import datetime
import uuid
import random
import logging
import base64

from ..models import (
    MediaUpload, MediaUploadCreate, SyncStatus, AIVerificationStatus,
    AIResult, UserRole
)
from ..auth import get_current_user, require_role
from ..config import get_db
from ..ai_validation import validate_image_with_ai
from ..cloudinary_service import upload_media_to_cloudinary, delete_media_from_cloudinary

router = APIRouter()
logger = logging.getLogger(__name__)

VALID_DOC_TYPES = {"photo", "video", "receipt", "form", "id_document", "other"}


# ── CHANGED: added utensil_name and description params ───────────────────────
async def trigger_ai_validation(
    media_id: str,
    media_base64: str,
    gps_coordinates: dict,
    loan_purpose: Optional[str] = None,
    utensil_name: Optional[str] = None,   # ← NEW
    description: Optional[str] = None,    # ← NEW (fallback parser)
):
    """Trigger real AI validation using HuggingFace"""
    db = get_db()
    ai_result_id = str(uuid.uuid4())

    try:
        logger.info(f"Starting AI validation for media {media_id} (purpose: {loan_purpose}, utensil: {utensil_name})")
        ai_results = await validate_image_with_ai(
            media_base64=media_base64,
            gps_coordinates=gps_coordinates,
            loan_purpose=loan_purpose,
            utensil_name=utensil_name,     # ← NEW
            description=description,       # ← NEW
        )
        status = ai_results["verification_status"]
        confidence = ai_results["confidence"]
        details = ai_results["details"]
        logger.info(f"AI validation complete: {status} (confidence: {confidence})")

    except Exception as e:
        logger.error(f"AI validation failed: {e}, falling back to mock")
        statuses = [AIVerificationStatus.VERIFIED, AIVerificationStatus.VERIFIED, AIVerificationStatus.SUSPICIOUS]
        status = random.choice(statuses)
        confidence = random.uniform(0.7, 0.99)
        details = {
            "checks": {
                "gps_valid": True,
                "timestamp_valid": True,
                "content_appropriate": status == AIVerificationStatus.VERIFIED,
            },
            "error": str(e),
            "fallback": True,
        }

    ai_result = {
        "id": ai_result_id,
        "media_id": media_id,
        "verification_status": status,
        "confidence": confidence,
        "details": details,
        "processed_at": datetime.utcnow(),
    }

    await db.ai_results.insert_one(ai_result)
    await db.media_uploads.update_one(
        {"id": media_id},
        {"$set": {"ai_verification_status": status}},
    )


# ─── Single JSON Upload ────────────────────────────────────────────────────────

@router.post("/media/upload", response_model=MediaUpload)
async def upload_media(
    media_data: MediaUploadCreate,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    try:
        if current_user["role"] == UserRole.BENEFICIARY:
            # Try to find beneficiary by user_id first
            beneficiary = await db.beneficiaries.find_one({"user_id": current_user["user_id"]})

            # Fallback: search by phone number if user_id link is missing
            if not beneficiary:
                user = await db.users.find_one({"id": current_user["user_id"]})
                if user:
                    beneficiary = await db.beneficiaries.find_one({"phone_number": user["phone_number"]})

            if not beneficiary:
                raise HTTPException(
                    status_code=404,
                    detail="No beneficiary profile found. Please contact an officer.",
                )
            media_data.beneficiary_id = beneficiary["id"]
            loan = await db.loans.find_one({"id": media_data.loan_id, "beneficiary_id": beneficiary["id"]})
            if not loan:
                raise HTTPException(status_code=403, detail="You can only upload media for your own loans")
        else:
            beneficiary = await db.beneficiaries.find_one({"id": media_data.beneficiary_id})
            if not beneficiary:
                raise HTTPException(status_code=404, detail="Beneficiary not found")
            loan = await db.loans.find_one({"id": media_data.loan_id})
            if not loan:
                raise HTTPException(status_code=404, detail="Loan not found")
            if loan["beneficiary_id"] != media_data.beneficiary_id:
                raise HTTPException(status_code=400, detail="Loan does not belong to the specified beneficiary")

        if not (-90 <= media_data.gps_coordinates.latitude <= 90):
            raise HTTPException(status_code=400, detail="Invalid latitude")
        if not (-180 <= media_data.gps_coordinates.longitude <= 180):
            raise HTTPException(status_code=400, detail="Invalid longitude")

        if len(media_data.media_base64) > 10 * 1024 * 1024 * 4 / 3:
            raise HTTPException(status_code=400, detail="Media file too large (max 10MB)")

        media_id = str(uuid.uuid4())
        cloudinary_result = upload_media_to_cloudinary(
            media_base64=media_data.media_base64,
            media_type=media_data.media_type,
            folder="loan_verification",
            public_id=media_id,
        )

        if not cloudinary_result.get("success"):
            raise HTTPException(status_code=500, detail=f"Cloud upload failed: {cloudinary_result.get('error')}")

        media_dict = media_data.dict(exclude={"media_base64"})
        media_doc = {
            "id": media_id,
            "beneficiary_id": media_data.beneficiary_id,
            "cloudinary_url": cloudinary_result.get("url"),
            "cloudinary_public_id": cloudinary_result.get("public_id"),
            "uploaded_by": current_user["user_id"],
            "upload_timestamp": datetime.utcnow(),
            "capture_timestamp": datetime.utcnow(),
            "sync_status": SyncStatus.SYNCED,
            "ai_verification_status": AIVerificationStatus.PENDING,
            **{k: v for k, v in media_dict.items() if k != "beneficiary_id"},
        }

        await db.media_uploads.insert_one(media_doc)
        logger.info(f"Media uploaded: {media_id} by {current_user['user_id']}")

        await trigger_ai_validation(
            media_id=media_id,
            media_base64=media_data.media_base64,
            gps_coordinates=media_data.gps_coordinates.dict(),
            loan_purpose=loan.get("purpose"),
            utensil_name=getattr(media_data, "utensil_name", None),  # ← NEW
            description=media_data.description,                       # ← NEW
        )

        return MediaUpload(**media_doc)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading media: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Multiple File Upload (multipart/form-data) ───────────────────────────────

@router.post("/media/upload-multiple")
async def upload_multiple_media(
    files: List[UploadFile] = File(..., description="One or more files (image/pdf)"),
    loan_id: str = Form(...),
    doc_type: str = Form("photo", description="photo | receipt | form | id_document | other"),
    description: Optional[str] = Form(None),
    utensil_name: Optional[str] = Form(None),   # ← NEW
    latitude: float = Form(...),
    longitude: float = Form(...),
    accuracy: Optional[float] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    db = get_db()

    if doc_type not in VALID_DOC_TYPES:
        raise HTTPException(status_code=400, detail=f"doc_type must be one of: {', '.join(VALID_DOC_TYPES)}")
    if not (-90 <= latitude <= 90):
        raise HTTPException(status_code=400, detail="Invalid latitude")
    if not (-180 <= longitude <= 180):
        raise HTTPException(status_code=400, detail="Invalid longitude")
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required")
    if len(files) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 files per request")

    if current_user["role"] == UserRole.BENEFICIARY:
        # Try to find beneficiary by user_id first
        beneficiary = await db.beneficiaries.find_one({"user_id": current_user["user_id"]})

        # Fallback: search by phone number if user_id link is missing
        if not beneficiary:
            user = await db.users.find_one({"id": current_user["user_id"]})
            if user:
                beneficiary = await db.beneficiaries.find_one({"phone_number": user["phone_number"]})

        if not beneficiary:
            raise HTTPException(status_code=404, detail="No beneficiary profile found. Contact an officer.")
        loan = await db.loans.find_one({"id": loan_id, "beneficiary_id": beneficiary["id"]})
        if not loan:
            raise HTTPException(status_code=403, detail="You can only upload media for your own loans")
    else:
        loan = await db.loans.find_one({"id": loan_id})
        if not loan:
            raise HTTPException(status_code=404, detail="Loan not found")
        beneficiary = await db.beneficiaries.find_one({"id": loan["beneficiary_id"]})
        if not beneficiary:
            raise HTTPException(status_code=404, detail="Beneficiary not found")

    gps = {"latitude": latitude, "longitude": longitude, "accuracy": accuracy}
    results = []
    errors = []

    for file in files:
        try:
            raw = await file.read()
            if len(raw) > 15 * 1024 * 1024:
                errors.append({"file": file.filename, "error": "File too large (max 15MB)"})
                continue

            b64 = base64.b64encode(raw).decode("utf-8")

            content_type = file.content_type or ""
            if "pdf" in content_type or doc_type in ("receipt", "form", "id_document"):
                cl_media_type = "raw"
            elif "video" in content_type:
                cl_media_type = "video"
            else:
                cl_media_type = "photo"

            media_id = str(uuid.uuid4())
            cloudinary_result = upload_media_to_cloudinary(
                media_base64=b64,
                media_type=cl_media_type,
                folder=f"loan_verification/{doc_type}",
                public_id=media_id,
            )

            if not cloudinary_result.get("success"):
                errors.append({"file": file.filename, "error": cloudinary_result.get("error")})
                continue

            media_doc = {
                "id": media_id,
                "beneficiary_id": beneficiary["id"],
                "loan_id": loan_id,
                "media_type": doc_type,
                "description": description or file.filename,
                "gps_coordinates": gps,
                "device_info": None,
                "cloudinary_url": cloudinary_result.get("url"),
                "cloudinary_public_id": cloudinary_result.get("public_id"),
                "uploaded_by": current_user["user_id"],
                "upload_timestamp": datetime.utcnow(),
                "capture_timestamp": datetime.utcnow(),
                "sync_status": SyncStatus.SYNCED,
                "ai_verification_status": AIVerificationStatus.PENDING,
                "original_filename": file.filename,
            }

            await db.media_uploads.insert_one(media_doc)

            await trigger_ai_validation(
                media_id=media_id,
                media_base64=b64,
                gps_coordinates=gps,
                loan_purpose=loan.get("purpose"),
                utensil_name=utensil_name,           # ← NEW
                description=description,             # ← NEW
            )

            results.append({
                "id": media_id,
                "filename": file.filename,
                "cloudinary_url": cloudinary_result.get("url"),
                "doc_type": doc_type,
                "status": "uploaded",
            })
            logger.info(f"Multi-upload: {media_id} ({file.filename}) by {current_user['user_id']}")

        except Exception as e:
            logger.error(f"Error uploading file {file.filename}: {e}")
            errors.append({"file": file.filename, "error": str(e)})

    return {
        "uploaded": len(results),
        "failed": len(errors),
        "results": results,
        "errors": errors,
    }


# ─── List media ───────────────────────────────────────────────────────────────

@router.get("/media", response_model=List[MediaUpload])
async def get_media(
    beneficiary_id: Optional[str] = None,
    loan_id: Optional[str] = None,
    uploaded_by: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    query = {}
    if beneficiary_id:
        query["beneficiary_id"] = beneficiary_id
    if loan_id:
        query["loan_id"] = loan_id
    if uploaded_by:
        query["uploaded_by"] = uploaded_by

    if current_user["role"] == UserRole.BENEFICIARY:
        query["uploaded_by"] = current_user["user_id"]

    media_list = await db.media_uploads.find(query).sort("upload_timestamp", -1).to_list(1000)
    return [MediaUpload(**m) for m in media_list]


# ─── Pending review (Officers only) ───────────────────────────────────────────

@router.get("/media/pending-review", response_model=List[MediaUpload])
async def get_pending_media(
    current_user: dict = Depends(require_role([UserRole.OFFICER, UserRole.ADMIN]))
):
    db = get_db()
    approved_media_ids = await db.approvals.distinct("media_id")
    query = {"id": {"$nin": approved_media_ids}}
    media_list = await db.media_uploads.find(query).sort("upload_timestamp", -1).to_list(1000)
    return [MediaUpload(**m) for m in media_list]


# ─── My loans (beneficiary helper) ────────────────────────────────────────────

@router.get("/media/my-loans")
async def get_my_loans(current_user: dict = Depends(get_current_user)):
    db = get_db()

    if current_user["role"] == UserRole.BENEFICIARY:
        # Try to find beneficiary by user_id first
        beneficiary = await db.beneficiaries.find_one({"user_id": current_user["user_id"]})

        # Fallback: search by phone number if user_id link is missing
        if not beneficiary:
            user = await db.users.find_one({"id": current_user["user_id"]})
            if user:
                beneficiary = await db.beneficiaries.find_one({"phone_number": user["phone_number"]})

        if not beneficiary:
            return {
                "beneficiary": None,
                "loans": [],
                "message": "No beneficiary profile found. Contact an officer.",
            }

        loans_raw = await db.loans.find({"beneficiary_id": beneficiary["id"]}).to_list(100)

        loans_out = []
        for loan in loans_raw:
            upload_count = await db.media_uploads.count_documents({"loan_id": loan["id"]})
            pending_count = await db.media_uploads.count_documents({
                "loan_id": loan["id"],
                "ai_verification_status": "pending",
            })
            loans_out.append({
                "id": loan["id"],
                "loan_id": loan["loan_id"],
                "purpose": loan["purpose"],
                "amount": loan["amount"],
                "status": loan["status"],
                "upload_count": upload_count,
                "pending_ai_count": pending_count,
            })

        return {
            "beneficiary": {"id": beneficiary["id"], "name": beneficiary["name"]},
            "loans": loans_out,
        }
    else:
        return {"message": "Officers should use the manage interface"}


# ─── AI Result ────────────────────────────────────────────────────────────────

@router.get("/ai-results/{media_id}", response_model=AIResult)
async def get_ai_result(
    media_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    result = await db.ai_results.find_one({"media_id": media_id})
    if not result:
        raise HTTPException(status_code=404, detail="AI result not found")
    return AIResult(**result)