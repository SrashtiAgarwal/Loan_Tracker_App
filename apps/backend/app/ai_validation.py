import base64
import io
import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForImageClassification

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Model config
# ---------------------------------------------------------------------------
_MODEL_NAME = "google/mobilenet_v2_1.0_224"
_model: Optional[Any] = None
_processor: Optional[Any] = None


# ---------------------------------------------------------------------------
# Purpose → accepted ImageNet label keywords
# ---------------------------------------------------------------------------
PURPOSE_KEYWORDS: Dict[str, List[str]] = {
    "bike":         ["motorcycle", "scooter", "bicycle", "bike", "motorbike", "moped"],
    "car":          ["car", "automobile", "sedan", "suv", "convertible", "jeep",
                     "pickup", "truck", "vehicle", "cab"],
    "home":         ["house", "building", "home", "apartment", "flat", "castle",
                     "construction", "church", "monastery", "palace"],
    "home renovation": ["refrigerator", "dishwasher", "washing machine", "microwave",
                        "oven", "stove", "sink", "bathtub", "toilet", "shower",
                        "tile", "paint", "door", "window", "cabinet", "furniture",
                        "sofa", "couch", "bed", "table", "wardrobe", "fan",
                        "air conditioner", "geyser", "house", "building", "room",
                        "kitchen", "bathroom", "ceiling", "floor", "wall"],
    "laptop":       ["laptop", "notebook computer", "notebook", "computer",
                     "desktop computer", "personal computer", "pc"],
    "mobile":       ["mobile phone", "smartphone", "cell phone", "phone",
                     "cellular telephone"],
    "electronics":  ["laptop", "notebook", "computer", "mobile phone", "smartphone",
                     "television", "monitor", "camera", "tablet"],
    "education":    ["book", "school", "university", "college", "classroom",
                     "library", "school bus", "bookshop", "notebook"],
    "business":     ["shop", "store", "office", "factory", "warehouse",
                     "cash machine", "atm", "gas pump", "market"],
    "agriculture":  ["tractor", "farm", "harvester", "plow", "field", "combine"],
    "medical":      ["ambulance", "hospital", "stethoscope", "syringe", "stretcher"],
}

# ---------------------------------------------------------------------------
# Utensil text → ImageNet label keywords
# This maps what the USER TYPED in the form to what MobileNet should see.
# Add more entries as your borrowers use different item names.
# ---------------------------------------------------------------------------
UTENSIL_KEYWORDS: Dict[str, List[str]] = {
    # Phones / mobile
    "phone":            ["mobile phone", "smartphone", "cell phone", "cellular telephone", "phone"],
    "mobile":           ["mobile phone", "smartphone", "cell phone", "cellular telephone", "phone"],
    "smartphone":       ["mobile phone", "smartphone", "cell phone", "phone"],
    "iphone":           ["mobile phone", "smartphone", "cell phone", "phone"],
    "android":          ["mobile phone", "smartphone", "cell phone", "phone"],

    # Laptops / computers
    "laptop":           ["laptop", "notebook computer", "notebook", "computer", "personal computer", "pc"],
    "computer":         ["laptop", "notebook computer", "desktop computer", "computer", "personal computer", "pc"],
    "notebook":         ["laptop", "notebook computer", "notebook", "computer"],
    "desktop":          ["desktop computer", "computer", "personal computer", "pc", "monitor"],
    "pc":               ["desktop computer", "computer", "personal computer", "pc"],

    # Vehicles
    "bike":             ["motorcycle", "scooter", "bicycle", "bike", "motorbike", "moped"],
    "motorcycle":       ["motorcycle", "motorbike", "moped", "scooter"],
    "scooter":          ["scooter", "motorcycle", "motorbike", "moped"],
    "bicycle":          ["bicycle", "bike"],
    "car":              ["car", "automobile", "sedan", "suv", "convertible", "jeep", "pickup", "vehicle"],
    "truck":            ["truck", "pickup", "vehicle", "car"],
    "auto":             ["car", "automobile", "vehicle", "cab"],

    # Farm equipment
    "tractor":          ["tractor", "farm", "harvester", "plow", "combine"],
    "harvester":        ["harvester", "combine", "tractor", "farm"],
    "pump":             ["gas pump", "water pump", "pump"],

    # Home appliances
    "refrigerator":     ["refrigerator", "dishwasher"],
    "fridge":           ["refrigerator"],
    "washing machine":  ["washing machine"],
    "ac":               ["air conditioner", "fan"],
    "air conditioner":  ["air conditioner"],
    "fan":              ["fan", "air conditioner"],
    "television":       ["television", "monitor", "screen"],
    "tv":               ["television", "monitor", "screen"],

    # Medical
    "sewing machine":   ["sewing machine", "machine"],
    "machine":          ["machine"],
}


def _normalize(text: str) -> str:
    return text.strip().lower()


def _match_purpose(label: str, purpose: str) -> bool:
    """Check if the AI-classified label matches the loan purpose."""
    label_lower = label.lower()
    norm = _normalize(purpose)
    keywords = PURPOSE_KEYWORDS.get(norm)
    if keywords is None:
        logger.warning(f"No keyword mapping for purpose '{purpose}'. Treating as passed.")
        return True
    return any(kw in label_lower or label_lower in kw for kw in keywords)


def _match_utensil(label: str, utensil_text: str) -> bool:
    """
    Check if the AI-classified label matches what the user TYPED as utensil/item.

    Strategy:
    1. Direct substring match — if "phone" appears in label, and user typed "phone", pass.
    2. Keyword dictionary lookup — map common item names to expected ImageNet labels.
    3. Word-by-word overlap — split user text into words and check each against label.
    """
    label_lower = label.lower()
    utensil_lower = _normalize(utensil_text)

    # 1. Direct substring: label contains what they typed (or vice versa)
    if utensil_lower in label_lower or label_lower in utensil_lower:
        return True

    # 2. Dictionary lookup
    for key, kw_list in UTENSIL_KEYWORDS.items():
        if key in utensil_lower or utensil_lower in key:
            if any(kw in label_lower or label_lower in kw for kw in kw_list):
                return True

    # 3. Word-by-word: "sewing machine" → ["sewing", "machine"]
    words = re.findall(r'\w+', utensil_lower)
    for word in words:
        if len(word) > 3 and word in label_lower:
            return True

    return False


def _parse_utensil_from_description(description: Optional[str]) -> Optional[str]:
    """
    Extract utensil name from description like:
      "Utensil: Tractor | Amount: ₹12000"
    Returns "Tractor" or None.
    """
    if not description:
        return None
    match = re.search(r'Utensil:\s*([^|]+)', description, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return None


# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------
def _load_model():
    global _model, _processor
    if _model is not None:
        return _model, _processor
    logger.info(f"Loading model: {_MODEL_NAME}")
    _processor = AutoImageProcessor.from_pretrained(_MODEL_NAME)
    _model = AutoModelForImageClassification.from_pretrained(_MODEL_NAME)
    _model.eval()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    _model = _model.to(device)
    logger.info(f"Model loaded on {device}")
    return _model, _processor


# ---------------------------------------------------------------------------
# Core classification
# ---------------------------------------------------------------------------
def classify_image(image_bytes: bytes) -> Dict[str, Any]:
    try:
        model, processor = _load_model()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        inputs = processor(images=image, return_tensors="pt")
        device = next(model.parameters()).device
        inputs = {k: v.to(device) for k, v in inputs.items()}
        with torch.no_grad():
            logits = model(**inputs).logits
        idx = logits.argmax(-1).item()
        confidence = torch.softmax(logits, dim=-1)[0, idx].item()
        label = model.config.id2label.get(idx, "unknown")
        logger.info(f"Classified as: {label} (confidence: {confidence:.2f})")
        return {
            "label": label,
            "confidence": round(confidence, 4),
            "model": _MODEL_NAME,
        }
    except Exception as e:
        logger.error(f"Classification error: {e}")
        return {"label": "error", "confidence": 0.0, "error": str(e)}


# ---------------------------------------------------------------------------
# Basic image sanity checks
# ---------------------------------------------------------------------------
def validate_image_basic(image_bytes: bytes) -> Dict[str, Any]:
    try:
        image = Image.open(io.BytesIO(image_bytes))
        w, h = image.size
        size = len(image_bytes)
        checks = {
            "valid_format":       image.format in ("JPEG", "PNG", "WEBP", "BMP"),
            "valid_size":         1_024 < size < 10 * 1_024 * 1_024,
            "valid_dimensions":   100 < w < 5_000 and 100 < h < 5_000,
            "valid_aspect_ratio": 0.2 < (w / h) < 5.0,
            "not_corrupted":      True,
        }
        quality_score = sum(checks.values()) / len(checks)
        return {
            "status": "valid" if all(checks.values()) else "invalid",
            "checks": checks,
            "properties": {"width": w, "height": h, "format": image.format, "size_bytes": size},
            "quality_score": round(quality_score, 2),
        }
    except Exception as e:
        logger.error(f"Image validation error: {e}")
        return {
            "status": "error",
            "checks": {"not_corrupted": False},
            "quality_score": 0.0,
            "error": str(e),
        }


# ---------------------------------------------------------------------------
# GPS validation
# ---------------------------------------------------------------------------
def validate_gps(gps: Optional[Dict[str, float]]) -> Dict[str, Any]:
    if not gps:
        return {"valid": False, "reason": "no_gps_data", "score": 0.0}
    lat = gps.get("latitude", 0)
    lon = gps.get("longitude", 0)
    accuracy = gps.get("accuracy", 999)
    checks = {
        "has_coordinates": lat != 0 or lon != 0,
        "valid_latitude":  -90 <= lat <= 90,
        "valid_longitude": -180 <= lon <= 180,
        "good_accuracy":   accuracy < 100,
    }
    is_valid = checks["has_coordinates"] and checks["valid_latitude"] and checks["valid_longitude"]
    return {
        "valid": is_valid,
        "checks": checks,
        "coordinates": {"latitude": lat, "longitude": lon, "accuracy": accuracy},
        "score": round(sum(checks.values()) / len(checks), 2),
    }


# ---------------------------------------------------------------------------
# Overall scoring — now utensil mismatch also causes failure
# ---------------------------------------------------------------------------
def _verification_status(
    image_val: Dict,
    classification: Dict,
    purpose_match: Optional[bool],
    utensil_match: Optional[bool],   # ← NEW
    gps_val: Dict,
) -> str:
    if image_val["status"] == "error":
        return "failed"
    if classification.get("label") == "error":
        return "failed"
    if purpose_match is False:
        return "failed"
    if utensil_match is False:        # ← NEW: typed item doesn't match image
        return "failed"
    if image_val["quality_score"] < 0.6:
        return "suspicious"
    if classification["confidence"] < 0.3:
        return "suspicious"
    if not gps_val["valid"]:
        return "suspicious"
    if gps_val["score"] < 0.5:
        return "suspicious"
    return "verified"


def _confidence_score(image_val: Dict, classification: Dict, gps_val: Dict) -> float:
    return round(
        image_val.get("quality_score", 0) * 0.30
        + classification.get("confidence", 0) * 0.30
        + gps_val.get("score", 0) * 0.40,
        2,
    )


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
async def validate_image_with_ai(
    media_base64: str,
    loan_purpose: Optional[str] = None,
    gps_coordinates: Optional[Dict[str, float]] = None,
    expected_asset_type: Optional[str] = None,  # kept for API compat
    # ↓ NEW PARAMS — pass these from your upload endpoint
    utensil_name: Optional[str] = None,         # explicit item name from form field
    description: Optional[str] = None,          # raw description string from frontend
) -> Dict[str, Any]:
    """
    Full validation pipeline:
      1. Basic image sanity check
      2. MobileNetV2 classification
      3. Loan-purpose keyword matching
      4. Utensil/item text vs image matching  ← NEW
      5. GPS validation
    """
    try:
        image_bytes = base64.b64decode(media_base64)

        image_val      = validate_image_basic(image_bytes)
        classification = classify_image(image_bytes)
        gps_val        = validate_gps(gps_coordinates)

        # ── Resolve utensil text ──────────────────────────────────────────
        # Prefer explicitly passed utensil_name; fall back to parsing description.
        resolved_utensil = utensil_name or _parse_utensil_from_description(description)

        purpose_match: Optional[bool] = None
        utensil_match: Optional[bool] = None
        matched_label: Optional[str]  = None
        mismatch_reason: Optional[str] = None

        label = classification.get("label", "")

        if label not in ("error", "unknown"):
            matched_label = label

            # 3. Purpose match
            if loan_purpose:
                purpose_match = _match_purpose(label, loan_purpose)
                if purpose_match:
                    logger.info(f"✅ Image matches loan purpose '{loan_purpose}' → label '{label}'")
                else:
                    logger.warning(f"❌ Image does NOT match loan purpose. Expected: '{loan_purpose}', got: '{label}'")
                    mismatch_reason = f"Image looks like '{label}' but loan purpose is '{loan_purpose}'"

            # 4. Utensil match — NEW
            if resolved_utensil:
                utensil_match = _match_utensil(label, resolved_utensil)
                if utensil_match:
                    logger.info(f"✅ Image matches typed item '{resolved_utensil}' → label '{label}'")
                else:
                    logger.warning(
                        f"❌ UTENSIL MISMATCH: user typed '{resolved_utensil}' "
                        f"but image classified as '{label}'"
                    )
                    mismatch_reason = (
                        mismatch_reason or
                        f"You typed '{resolved_utensil}' but image looks like '{label}'"
                    )

        status     = _verification_status(image_val, classification, purpose_match, utensil_match, gps_val)
        confidence = _confidence_score(image_val, classification, gps_val)

        logger.info(f"Validation complete: {status} (confidence: {confidence})")

        return {
            "verification_status": status,
            "confidence": confidence,
            "details": {
                "image_validation":   image_val,
                "ai_classification":  classification,
                "purpose_match":      purpose_match,
                "utensil_match":      utensil_match,       # ← NEW
                "matched_label":      matched_label,
                "expected_purpose":   loan_purpose,
                "expected_utensil":   resolved_utensil,    # ← NEW
                "mismatch_reason":    mismatch_reason,     # ← NEW: human-readable reason
                "gps_validation":     gps_val,
                "timestamp":         datetime.utcnow().isoformat(),
            },
        }

    except Exception as e:
        logger.error(f"AI validation error: {e}")
        return {
            "verification_status": "failed",
            "confidence": 0.0,
            "details": {"error": str(e)},
        }