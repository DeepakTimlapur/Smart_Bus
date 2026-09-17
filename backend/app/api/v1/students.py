import secrets
import string
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from backend.app.db import get_db, persist_mock_data
from backend.app.security import require_admin, get_password_hash
from backend.app.services.email_service import send_student_credentials
from backend.app.models import (
    StudentCreate,
    StudentUpdate,
    StudentResponse,
)

router = APIRouter(prefix="/students", tags=["Students"])


def _generate_temp_password(length: int = 10) -> str:
    """Generates a readable, secure temporary password."""
    alphabet = string.ascii_letters + string.digits + "!@#$"
    # Ensure at least one uppercase, lowercase, digit, special char
    password = [
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.digits),
        secrets.choice("!@#$"),
    ]
    password += [secrets.choice(alphabet) for _ in range(length - 4)]
    secrets.SystemRandom().shuffle(password)
    return "".join(password)


@router.get("", response_model=List[StudentResponse])
async def list_students(
    admin: Dict[str, Any] = Depends(require_admin),
    db: Any = Depends(get_db),
):
    """Admin endpoint to list all registered students with current transit & fee status."""
    students = list(db.students.find({}, {"_id": 0}))
    results: List[StudentResponse] = []

    for s in students:
        student_id = s.get("student_id")
        # Read fee record
        fee_doc = db.fees.find_one({"student_id": student_id}) or {}
        total = float(fee_doc.get("fee_total", s.get("fee_total", 35000.0)))
        paid = float(fee_doc.get("fee_paid", s.get("fee_paid", 0.0)))
        pending = max(0.0, total - paid)
        if paid >= total and total > 0:
            fee_status = "PAID"
        elif paid > 0:
            fee_status = "PARTIAL"
        else:
            fee_status = "PENDING"

        results.append(
            StudentResponse(
                student_id=student_id,
                name=s.get("name", ""),
                email=s.get("email", ""),
                phone=s.get("phone", ""),
                department=s.get("department", ""),
                year=s.get("year", ""),
                semester=s.get("semester", ""),
                bus_id=s.get("bus_id", ""),
                pickup_location=s.get("pickup_location", ""),
                fee_total=total,
                fee_paid=paid,
                fee_pending=pending,
                fee_status=fee_status,
                account_status=s.get("account_status", "ACTIVE"),
                created_at=s.get("created_at"),
                updated_at=s.get("updated_at"),
            )
        )

    return results


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_student(
    payload: StudentCreate,
    admin: Dict[str, Any] = Depends(require_admin),
    db: Any = Depends(get_db),
):
    """
    Creates a new student account:
    1. Validates unique Student ID and Email.
    2. Generates secure temporary password.
    3. Creates MongoDB user credentials and student profile.
    4. Creates initial fee ledger entry.
    5. Dispatches credentials to student email immediately.
    6. Returns student profile and email delivery status.
    """
    clean_id = payload.student_id.strip().upper()
    clean_email = payload.email.strip().lower()

    # Check for existing student ID or email
    if db.students.find_one({"student_id": clean_id}):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Student ID '{clean_id}' is already registered.",
        )

    if db.users.find_one({"email": clean_email}) or db.students.find_one({"email": clean_email}):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Email address '{clean_email}' is already associated with an account.",
        )

    # Generate temporary password
    temp_password = _generate_temp_password(10)
    password_hash = get_password_hash(temp_password)
    now = datetime.now(timezone.utc).isoformat()

    # 1. Create User account in 'users'
    user_doc = {
        "username": clean_id,
        "email": clean_email,
        "name": payload.name.strip(),
        "password_hash": password_hash,
        "role": "STUDENT",
        "student_id": clean_id,
        "assigned_bus": payload.bus_id or "BUS-01",
        "account_status": "ACTIVE",
        "created_at": now,
        "updated_at": now,
    }
    db.users.insert_one(user_doc)

    # 2. Calculate fee status
    total_fee = float(payload.fee_total if payload.fee_total is not None else 35000.0)
    paid_fee = float(payload.fee_paid if payload.fee_paid is not None else 0.0)
    if paid_fee > total_fee:
        paid_fee = total_fee
    pending_fee = max(0.0, total_fee - paid_fee)

    if paid_fee >= total_fee and total_fee > 0:
        fee_status = "PAID"
    elif paid_fee > 0:
        fee_status = "PARTIAL"
    else:
        fee_status = "PENDING"

    # 3. Create Student profile in 'students'
    student_doc = {
        "student_id": clean_id,
        "name": payload.name.strip(),
        "email": clean_email,
        "phone": payload.phone or "",
        "department": payload.department or "Engineering",
        "year": payload.year or "1st Year",
        "semester": payload.semester or "1st Sem",
        "bus_id": payload.bus_id or "BUS-01",
        "pickup_location": payload.pickup_location or "Campus Main Gate",
        "fee_total": total_fee,
        "fee_paid": paid_fee,
        "fee_pending": pending_fee,
        "fee_status": fee_status,
        "account_status": "ACTIVE",
        "created_at": now,
        "updated_at": now,
    }
    db.students.insert_one(student_doc)

    # 4. Create Fee ledger in 'fees'
    fee_doc = {
        "student_id": clean_id,
        "student_name": payload.name.strip(),
        "email": clean_email,
        "bus_id": payload.bus_id or "BUS-01",
        "fee_total": total_fee,
        "fee_paid": paid_fee,
        "fee_pending": pending_fee,
        "fee_status": fee_status,
        "updated_at": now,
    }
    db.fees.insert_one(fee_doc)

    persist_mock_data()

    # 5. Dispatch email credentials
    email_result = send_student_credentials(
        student_name=payload.name.strip(),
        student_id=clean_id,
        email=clean_email,
        temp_password=temp_password,
        db=db,
    )

    return {
        "message": "Student account successfully created.",
        "student": {
            "student_id": clean_id,
            "name": payload.name.strip(),
            "email": clean_email,
            "bus_id": payload.bus_id,
            "fee_total": total_fee,
            "fee_paid": paid_fee,
            "fee_pending": pending_fee,
            "fee_status": fee_status,
            "account_status": "ACTIVE",
        },
        "email_delivery": email_result,
    }


@router.get("/{student_id}", response_model=StudentResponse)
async def get_student(
    student_id: str,
    admin: Dict[str, Any] = Depends(require_admin),
    db: Any = Depends(get_db),
):
    """Retrieves specific student details and fee status."""
    s = db.students.find_one({"student_id": student_id.upper()}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Student not found.")

    fee_doc = db.fees.find_one({"student_id": student_id.upper()}) or {}
    total = float(fee_doc.get("fee_total", s.get("fee_total", 35000.0)))
    paid = float(fee_doc.get("fee_paid", s.get("fee_paid", 0.0)))
    pending = max(0.0, total - paid)
    fee_status = "PAID" if paid >= total else ("PARTIAL" if paid > 0 else "PENDING")

    return StudentResponse(
        student_id=s.get("student_id"),
        name=s.get("name"),
        email=s.get("email"),
        phone=s.get("phone", ""),
        department=s.get("department", ""),
        year=s.get("year", ""),
        semester=s.get("semester", ""),
        bus_id=s.get("bus_id", ""),
        pickup_location=s.get("pickup_location", ""),
        fee_total=total,
        fee_paid=paid,
        fee_pending=pending,
        fee_status=fee_status,
        account_status=s.get("account_status", "ACTIVE"),
        created_at=s.get("created_at"),
        updated_at=s.get("updated_at"),
    )


@router.put("/{student_id}")
async def update_student(
    student_id: str,
    payload: StudentUpdate,
    admin: Dict[str, Any] = Depends(require_admin),
    db: Any = Depends(get_db),
):
    """Updates student records and synchronizes linked user profile."""
    clean_id = student_id.upper()
    existing = db.students.find_one({"student_id": clean_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Student not found.")

    updates: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    user_updates: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}

    if payload.name is not None:
        updates["name"] = payload.name.strip()
        user_updates["name"] = payload.name.strip()
    if payload.email is not None:
        new_email = payload.email.strip().lower()
        if new_email != existing.get("email"):
            if db.students.find_one({"email": new_email, "student_id": {"$ne": clean_id}}):
                raise HTTPException(status_code=400, detail="Email is already used by another student.")
        updates["email"] = new_email
        user_updates["email"] = new_email
    if payload.phone is not None:
        updates["phone"] = payload.phone.strip()
    if payload.department is not None:
        updates["department"] = payload.department.strip()
    if payload.year is not None:
        updates["year"] = payload.year.strip()
    if payload.semester is not None:
        updates["semester"] = payload.semester.strip()
    if payload.bus_id is not None:
        updates["bus_id"] = payload.bus_id.strip()
        user_updates["assigned_bus"] = payload.bus_id.strip()
    if payload.pickup_location is not None:
        updates["pickup_location"] = payload.pickup_location.strip()
    if payload.account_status is not None:
        updates["account_status"] = payload.account_status.strip()
        user_updates["account_status"] = payload.account_status.strip()

    db.students.update_one({"student_id": clean_id}, {"$set": updates})
    db.users.update_one({"student_id": clean_id}, {"$set": user_updates})
    persist_mock_data()

    return {"message": "Student details updated successfully."}


@router.delete("/{student_id}")
async def delete_student(
    student_id: str,
    admin: Dict[str, Any] = Depends(require_admin),
    db: Any = Depends(get_db),
):
    """Removes a student, their associated login credentials, and fee record."""
    clean_id = student_id.upper()
    existing = db.students.find_one({"student_id": clean_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Student not found.")

    db.students.delete_one({"student_id": clean_id})
    db.users.delete_one({"$or": [{"student_id": clean_id}, {"username": clean_id}]})
    db.fees.delete_one({"student_id": clean_id})
    persist_mock_data()

    return {"message": f"Student '{clean_id}' and all associated records deleted."}


@router.post("/{student_id}/resend-credentials")
async def resend_credentials(
    student_id: str,
    admin: Dict[str, Any] = Depends(require_admin),
    db: Any = Depends(get_db),
):
    """
    Regenerates a secure temporary password and dispatches credentials to student email.
    """
    clean_id = student_id.upper()
    student = db.students.find_one({"student_id": clean_id})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")

    email = student.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Student does not have an email registered.")

    temp_password = _generate_temp_password(10)
    new_hash = get_password_hash(temp_password)
    now = datetime.now(timezone.utc).isoformat()

    db.users.update_one(
        {"$or": [{"student_id": clean_id}, {"username": clean_id}]},
        {"$set": {"password_hash": new_hash, "updated_at": now}},
    )
    persist_mock_data()

    email_result = send_student_credentials(
        student_name=student.get("name", "Student"),
        student_id=clean_id,
        email=email,
        temp_password=temp_password,
        db=db,
    )

    return {
        "message": "Credentials regenerated and dispatched.",
        "student_id": clean_id,
        "email": email,
        "email_delivery": email_result,
    }
