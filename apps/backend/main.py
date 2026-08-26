# Entry-point shim so the server can be started from the backend/ directory
# with either of:
#   uvicorn main:app --reload          (short form)
#   uvicorn app.main:app --reload      (explicit form)

from app.main import app  # noqa: F401  re-export the FastAPI instance
