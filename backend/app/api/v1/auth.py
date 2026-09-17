from typing import Any, Dict, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from backend.app.db import get_db, persist_mock_data
from backend.app.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    get_current_user,
)
from backend.app.models import (
    LoginRequest,
    TokenResponse,
    UserProfileResponse,
    ChangePasswordRequest,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    db: Any = Depends(get_db),
):
    """
    Unified login endpoint accepting either JSON {username, password} or Form Data.
    Authenticates ADMIN, DRIVER, or STUDENT users.
    Returns signed JWT access token.
    """
    username = ""
    password = ""

    # Parse content type
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        body = await request.json()
        username = str(body.get("username", "")).strip()
        password = str(body.get("password", "")).strip()
    elif "application/x-www-form-urlencoded" in content_type or "multipart/form-data" in content_type:
        form = await request.form()
        username = str(form.get("username", "")).strip()
        password = str(form.get("password", "")).strip()
    else:
        # Try JSON first, then form
        try:
            body = await request.json()
            username = str(body.get("username", "")).strip()
            password = str(body.get("password", "")).strip()
        except Exception:
            form = await request.form()
            username = str(form.get("username", "")).strip()
            password = str(form.get("password", "")).strip()

    if not username or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username and password are required.",
        )

    # Search user by username (case-insensitive) or email
    user = db.users.find_one({
        "$or": [
            {"username": {"$regex": f"^{username}$", "$options": "i"}},
            {"email": {"$regex": f"^{username}$", "$options": "i"}},
            {"student_id": {"$regex": f"^{username}$", "$options": "i"}},
        ]
    })

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not verify_password(password, user.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check account status
    if user.get("account_status") == "DISABLED":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been disabled. Contact campus transit administration.",
        )

    # Generate JWT
    token_data = {
        "sub": user.get("username"),
        "username": user.get("username"),
        "role": user.get("role"),
        "email": user.get("email"),
        "name": user.get("name"),
        "assigned_bus": user.get("assigned_bus"),
        "student_id": user.get("student_id"),
    }
    token = create_access_token(token_data)

    # Update last login timestamp
    now = datetime.now(timezone.utc).isoformat()
    db.users.update_one(
        {"username": user.get("username")},
        {"$set": {"last_login": now}},
    )
    persist_mock_data()

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        role=user.get("role", "STUDENT"),
        username=user.get("username"),
        assigned_bus=user.get("assigned_bus"),
        email=user.get("email"),
        name=user.get("name"),
    )


@router.get("/me", response_model=UserProfileResponse)
async def get_my_profile(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    """Returns the authenticated user's profile and active session attributes."""
    # Fetch fresh student/driver info if relevant
    assigned_bus = current_user.get("assigned_bus")
    student_id = current_user.get("student_id")
    department = current_user.get("department")
    phone = current_user.get("phone")

    if current_user.get("role") == "STUDENT" and student_id:
        student_doc = db.students.find_one({"student_id": student_id})
        if student_doc:
            assigned_bus = student_doc.get("bus_id", assigned_bus)
            department = student_doc.get("department", department)
            phone = student_doc.get("phone", phone)

    return UserProfileResponse(
        username=current_user.get("username", "user"),
        role=current_user.get("role", "STUDENT"),
        email=current_user.get("email"),
        name=current_user.get("name", current_user.get("username")),
        assigned_bus=assigned_bus,
        student_id=student_id,
        department=department,
        phone=phone,
    )


@router.post("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    """Allows authenticated user to update their account password."""
    username = current_user.get("username")
    user = db.users.find_one({"username": username})
    if not user:
        raise HTTPException(status_code=404, detail="User account not found.")

    if not verify_password(data.old_password, user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Incorrect current password.")

    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters.")

    new_hash = get_password_hash(data.new_password)
    db.users.update_one(
        {"username": username},
        {"$set": {"password_hash": new_hash, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    persist_mock_data()
    return {"message": "Password updated successfully."}
