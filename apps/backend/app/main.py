from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from app.config import db_instance
from app.routes import auth, users, beneficiaries, loans, media, stats, approvals, audit

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    db_instance.connect()
    logger.info("Database connected successfully")
    yield
    # Shutdown
    db_instance.close()
    logger.info("Database connection closed")

# Create the main app with lifespan
app = FastAPI(title="Loan Tracking API", lifespan=lifespan)

# Include Routers
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(beneficiaries.router, prefix="/api/beneficiaries", tags=["Beneficiaries"])
app.include_router(loans.router, prefix="/api/loans", tags=["Loans"])
app.include_router(media.router, prefix="/api", tags=["Media"]) # /api/media and /api/ai-results
app.include_router(stats.router, prefix="/api/stats", tags=["Stats"])
app.include_router(approvals.router, prefix="/api/approvals", tags=["Approvals"])
app.include_router(audit.router, prefix="/api/audit", tags=["Audit"])

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Loan Tracking API is running"}

@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring"""
    return {
        "status": "healthy",
        "database": "connected" if db_instance.db is not None else "disconnected"
    }
