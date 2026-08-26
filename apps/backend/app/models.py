from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

# Enums
class UserRole(str, Enum):
    BENEFICIARY = "beneficiary"
    OFFICER = "officer"
    ADMIN = "admin"

class LoanStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    ACTIVE = "active"
    COMPLETED = "completed"
    REJECTED = "rejected"

class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    REUPLOAD_REQUESTED = "reupload_requested"

class SyncStatus(str, Enum):
    PENDING = "pending"
    SYNCED = "synced"
    FAILED = "failed"

class AIVerificationStatus(str, Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    FAILED = "failed"
    SUSPICIOUS = "suspicious"

# User Models
class UserBase(BaseModel):
    phone_number: str
    role: UserRole = UserRole.BENEFICIARY
    name: Optional[str] = None

class UserCreate(UserBase):
    pass

class User(UserBase):
    id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    fcm_token: Optional[str] = None

# Beneficiary Models
class BeneficiaryBase(BaseModel):
    name: str
    phone_number: str
    address: str
    aadhaar: Optional[str] = None
    email: Optional[str] = None

class BeneficiaryCreate(BeneficiaryBase):
    pass

class Beneficiary(BeneficiaryBase):
    id: str
    user_id: Optional[str] = None
    created_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

# Loan Models
class LoanBase(BaseModel):
    loan_id: str
    purpose: str
    amount: float
    tenure_months: int
    interest_rate: Optional[float] = None
    status: LoanStatus = LoanStatus.PENDING
    estimated_item_cost: Optional[float] = None
    remaining_balance: Optional[float] = None
    purchase_spent: float = 0.0      # ← ADD
    ancillary_spent: float = 0.0     # ← ADD

class LoanCreate(LoanBase):
    beneficiary_id: str

class Loan(LoanBase):
    id: str
    beneficiary_id: str
    disbursement_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str
    updated_at: Optional[datetime] = None

# Expense Tracking Models
class ExpenseBase(BaseModel):
    loan_id: str
    amount: float
    description: str
    category: str
    receipt_media_id: Optional[str] = None

class ExpenseCreate(ExpenseBase):
    pass

class Expense(ExpenseBase):
    id: str
    beneficiary_id: str
    created_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

# Media Upload Models
class GPSCoordinates(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None

class DeviceInfo(BaseModel):
    device_model: Optional[str] = None
    os_version: Optional[str] = None
    app_version: Optional[str] = None

class MediaUploadBase(BaseModel):
    beneficiary_id: Optional[str] = None
    loan_id: str
    media_type: str  # photo | video | receipt | form | id_document | other
    description: Optional[str] = None
    gps_coordinates: GPSCoordinates
    device_info: Optional[DeviceInfo] = None
    original_filename: Optional[str] = None

class MediaUploadCreate(MediaUploadBase):
    media_base64: str
    utensil_name: Optional[str] = None  # ← NEW: typed item name, cross-checked against image by AI

class MediaUpload(MediaUploadBase):
    id: str
    cloudinary_url: Optional[str] = None
    cloudinary_public_id: Optional[str] = None
    uploaded_by: str
    upload_timestamp: datetime = Field(default_factory=datetime.utcnow)
    capture_timestamp: datetime
    sync_status: SyncStatus = SyncStatus.SYNCED
    ai_verification_status: Optional[AIVerificationStatus] = AIVerificationStatus.PENDING

# AI Result Models
class AIResultBase(BaseModel):
    verification_status: AIVerificationStatus
    confidence: float
    details: Optional[Dict[str, Any]] = None

class AIResultCreate(AIResultBase):
    media_id: str

class AIResult(AIResultBase):
    id: str
    media_id: str
    processed_at: datetime = Field(default_factory=datetime.utcnow)

# Approval Models
class ApprovalBase(BaseModel):
    status: ApprovalStatus
    comments: Optional[str] = None

class ApprovalCreate(ApprovalBase):
    media_id: str

class Approval(ApprovalBase):
    id: str
    media_id: str
    officer_id: str
    officer_name: Optional[str] = None
    approved_at: datetime = Field(default_factory=datetime.utcnow)

# Sync Queue Models
class SyncQueueItem(BaseModel):
    id: str
    user_id: str
    action_type: str
    payload: Dict[str, Any]
    sync_status: SyncStatus = SyncStatus.PENDING
    retry_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    synced_at: Optional[datetime] = None

# Auth Models
class OTPRequest(BaseModel):
    phone_number: str

class OTPVerify(BaseModel):
    phone_number: str
    otp: str
    name: Optional[str] = None
    role: Optional[UserRole] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User

# Response Models
class MessageResponse(BaseModel):
    message: str
    data: Optional[Any] = None