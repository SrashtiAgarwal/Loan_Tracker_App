"""
Cloudinary Service for Image/Video Upload
Handles media upload to Cloudinary cloud storage
"""

import os
import base64
import logging
from typing import Dict, Any, Optional
import cloudinary
import cloudinary.uploader
import cloudinary.api
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Configure Cloudinary
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True
)

# MIME type mappings
IMAGE_MIME_TYPES = {
    "jpeg": "image/jpeg",
    "jpg":  "image/jpeg",
    "png":  "image/png",
    "gif":  "image/gif",
    "webp": "image/webp",
    "bmp":  "image/bmp",
    "tiff": "image/tiff",
    "svg":  "image/svg+xml",
    "heic": "image/heic",
    "heif": "image/heif",
}

VIDEO_MIME_TYPES = {
    "mp4":  "video/mp4",
    "mov":  "video/quicktime",
    "avi":  "video/x-msvideo",
    "mkv":  "video/x-matroska",
    "webm": "video/webm",
    "flv":  "video/x-flv",
    "wmv":  "video/x-ms-wmv",
    "3gp":  "video/3gpp",
}


def _detect_mime_type(media_base64: str, media_type: str, mime_type: Optional[str]) -> str:
    """
    Detect the correct MIME type for the media.

    Priority:
      1. Explicitly passed mime_type
      2. Magic-byte sniffing from the raw base64 data
      3. Fallback based on media_type ('photo' → image/jpeg, 'video' → video/mp4)
    """
    if mime_type:
        return mime_type

    # Sniff magic bytes from the decoded header (first 12 bytes is enough)
    try:
        header = base64.b64decode(media_base64[:16] + "==")[:12]

        # JPEG: FF D8 FF
        if header[:3] == b'\xff\xd8\xff':
            return "image/jpeg"
        # PNG: 89 50 4E 47
        if header[:4] == b'\x89PNG':
            return "image/png"
        # GIF: GIF87a / GIF89a
        if header[:6] in (b'GIF87a', b'GIF89a'):
            return "image/gif"
        # WEBP: RIFF????WEBP
        if header[:4] == b'RIFF' and header[8:12] == b'WEBP':
            return "image/webp"
        # BMP: BM
        if header[:2] == b'BM':
            return "image/bmp"
        # MP4 / MOV (ftyp box at offset 4)
        if header[4:8] in (b'ftyp', b'moov', b'mdat'):
            return "video/mp4"
        # WebM / MKV: EBML header
        if header[:4] == b'\x1a\x45\xdf\xa3':
            return "video/webm"
    except Exception:
        pass  # Fall through to default

    # Fallback
    return "image/jpeg" if media_type == "photo" else "video/mp4"


def upload_media_to_cloudinary(
    media_base64: str,
    media_type: str = "photo",
    folder: str = "loan_verification",
    public_id: Optional[str] = None,
    mime_type: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Upload media (photo/video) to Cloudinary.

    Args:
        media_base64: Base64 encoded media data (raw, without data URI prefix)
        media_type:   'photo' or 'video'
        folder:       Cloudinary folder to store the media
        public_id:    Optional custom public ID
        mime_type:    Optional explicit MIME type (e.g. 'image/png').
                      When omitted, the function auto-detects from magic bytes.

    Returns:
        Dictionary with upload results including URL and public_id
    """
    try:
        # Resolve correct MIME type and Cloudinary resource_type
        detected_mime = _detect_mime_type(media_base64, media_type, mime_type)

        if detected_mime.startswith("video/"):
            resource_type = "video"
        elif detected_mime.startswith("image/"):
            resource_type = "image"
        else:
            # raw files (PDFs, etc.)
            resource_type = "raw"

        # Build data URI with the correct MIME type
        data_uri = f"data:{detected_mime};base64,{media_base64}"

        # Prepare upload options
        upload_options: Dict[str, Any] = {
            "folder": folder,
            "resource_type": resource_type,
            "overwrite": False,
            "invalidate": True,
        }

        if public_id:
            upload_options["public_id"] = public_id

        # Quality / format optimisations for images only
        if resource_type == "image":
            upload_options["transformation"] = [
                {"quality": "auto:good"},
                {"fetch_format": "auto"},
            ]

        logger.info(
            f"Uploading {media_type} to Cloudinary "
            f"(mime={detected_mime}, resource_type={resource_type})..."
        )

        result = cloudinary.uploader.upload(data_uri, **upload_options)

        logger.info(f"✅ Upload successful: {result.get('public_id')}")

        return {
            "success": True,
            "url": result.get("secure_url"),
            "public_id": result.get("public_id"),
            "format": result.get("format"),
            "resource_type": result.get("resource_type"),
            "bytes": result.get("bytes"),
            "width": result.get("width"),
            "height": result.get("height"),
            "created_at": result.get("created_at"),
        }

    except Exception as e:
        logger.error(f"❌ Cloudinary upload failed: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "url": None,
            "public_id": None,
        }


def upload_media_from_bytes(
    file_bytes: bytes,
    media_type: str = "photo",
    folder: str = "loan_verification",
    public_id: Optional[str] = None,
    content_type: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Convenience wrapper: accepts raw bytes (e.g. from FastAPI UploadFile.read())
    and converts to base64 before uploading.

    Args:
        file_bytes:   Raw file bytes
        media_type:   'photo' or 'video'
        folder:       Cloudinary folder
        public_id:    Optional custom public ID
        content_type: HTTP Content-Type from the upload request (e.g. 'image/png')

    Returns:
        Same dict as upload_media_to_cloudinary
    """
    media_base64 = base64.b64encode(file_bytes).decode("utf-8")
    return upload_media_to_cloudinary(
        media_base64=media_base64,
        media_type=media_type,
        folder=folder,
        public_id=public_id,
        mime_type=content_type,
    )


def delete_media_from_cloudinary(public_id: str, resource_type: str = "image") -> bool:
    """
    Delete media from Cloudinary.

    Args:
        public_id:     Cloudinary public ID of the media
        resource_type: 'image', 'video', or 'raw'

    Returns:
        True if deletion was successful, False otherwise
    """
    try:
        logger.info(f"Deleting media from Cloudinary: {public_id}")
        result = cloudinary.uploader.destroy(public_id, resource_type=resource_type)

        if result.get("result") == "ok":
            logger.info(f"✅ Media deleted successfully: {public_id}")
            return True
        else:
            logger.warning(f"⚠️ Media deletion failed: {result}")
            return False

    except Exception as e:
        logger.error(f"❌ Error deleting media: {str(e)}")
        return False


def get_cloudinary_url(public_id: str, transformations: Optional[list] = None) -> str:
    """
    Generate a Cloudinary URL with optional transformations.

    Args:
        public_id:       Cloudinary public ID
        transformations: Optional list of transformation dicts

    Returns:
        Cloudinary URL string
    """
    try:
        img = cloudinary.CloudinaryImage(public_id)
        if transformations:
            return img.build_url(transformation=transformations)
        return img.build_url()
    except Exception as e:
        logger.error(f"Error generating Cloudinary URL: {str(e)}")
        return ""


def get_thumbnail_url(public_id: str, width: int = 300, height: int = 300) -> str:
    """
    Generate a thumbnail URL for an image.

    Args:
        public_id: Cloudinary public ID
        width:     Thumbnail width in pixels
        height:    Thumbnail height in pixels

    Returns:
        Thumbnail URL string
    """
    transformations = [
        {"width": width, "height": height, "crop": "fill"},
        {"quality": "auto:good"},
        {"fetch_format": "auto"},
    ]
    return get_cloudinary_url(public_id, transformations)


def test_cloudinary_connection() -> bool:
    """
    Test Cloudinary connection and credentials.

    Returns:
        True if connection is successful, False otherwise
    """
    try:
        cloudinary.api.ping()
        logger.info("✅ Cloudinary connection successful")
        return True
    except Exception as e:
        logger.error(f"❌ Cloudinary connection failed: {str(e)}")
        return False