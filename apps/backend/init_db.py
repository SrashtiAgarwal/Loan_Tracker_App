"""
Database initialization script
Creates indexes for better query performance
Run this once after setting up the database
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "loan_tracking_db")

async def create_indexes():
    """Create database indexes for optimal performance"""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    print("Creating database indexes...")
    
    # Users collection indexes
    await db.users.create_index("phone_number", unique=True)
    await db.users.create_index("role")
    print(" Users indexes created")
    
    # Beneficiaries collection indexes
    await db.beneficiaries.create_index("phone_number")
    await db.beneficiaries.create_index("user_id")
    await db.beneficiaries.create_index("created_by")
    print("✅ Beneficiaries indexes created")
    
    # Loans collection indexes
    await db.loans.create_index("loan_id", unique=True)
    await db.loans.create_index("beneficiary_id")
    await db.loans.create_index("status")
    await db.loans.create_index([("created_at", -1)])  # Descending for recent first
    print("✅ Loans indexes created")
    
    # Media uploads collection indexes
    await db.media_uploads.create_index("beneficiary_id")
    await db.media_uploads.create_index("loan_id")
    await db.media_uploads.create_index("uploaded_by")
    await db.media_uploads.create_index("ai_verification_status")
    await db.media_uploads.create_index([("upload_timestamp", -1)])
    print("✅ Media uploads indexes created")
    
    # Approvals collection indexes
    await db.approvals.create_index("media_id")
    await db.approvals.create_index("officer_id")
    await db.approvals.create_index("status")
    await db.approvals.create_index([("approved_at", -1)])
    # Compound index for checking duplicate approvals
    await db.approvals.create_index([("media_id", 1), ("officer_id", 1)])
    print("✅ Approvals indexes created")
    
    # AI results collection indexes
    await db.ai_results.create_index("media_id", unique=True)
    await db.ai_results.create_index("verification_status")
    print("✅ AI results indexes created")
    
    # Audit logs collection indexes
    await db.audit_logs.create_index("entity_type")
    await db.audit_logs.create_index("entity_id")
    await db.audit_logs.create_index("user_id")
    await db.audit_logs.create_index([("timestamp", -1)])
    print("✅ Audit logs indexes created")
    
    print("\n🎉 All indexes created successfully!")
    print("\nIndexes summary:")
    print("=" * 50)
    
    # List all indexes
    collections = ["users", "beneficiaries", "loans", "media_uploads", "approvals", "ai_results", "audit_logs"]
    for coll_name in collections:
        indexes = await db[coll_name].index_information()
        print(f"\n{coll_name}: {len(indexes)} indexes")
        for idx_name, idx_info in indexes.items():
            if idx_name != "_id_":
                print(f"  - {idx_name}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(create_indexes())
