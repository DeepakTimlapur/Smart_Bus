from datetime import datetime, timezone
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from backend.app.db import get_db, persist_mock_data
from backend.app.security import get_current_user, require_admin
from backend.app.models import FeeUpdate, FeeResponse

router = APIRouter(tags=["Fee Management"])


@router.get("/fees", response_model=List[FeeResponse])
async def list_all_fees(
    admin: Dict[str, Any] = Depends(require_admin),
    db: Any = Depends(get_db),
):
    """Admin endpoint to list all student fee ledgers and collection statuses."""
    fee_records = list(db.fees.find({}, {"_id": 0}))
    results: List[FeeResponse] = []

    for f in fee_records:
        student_id = f.get("student_id")
        total = float(f.get("fee_total", 35000.0))
        paid = float(f.get("fee_paid", 0.0))
        pending = max(0.0, total - paid)

        if paid >= total and total > 0:
            fee_status = "PAID"
        elif paid > 0:
            fee_status = "PARTIAL"
        else:
            fee_status = "PENDING"

        results.append(
            FeeResponse(
                student_id=student_id,
                student_name=f.get("student_name", "Student"),
                email=f.get("email"),
                bus_id=f.get("bus_id"),
                fee_total=total,
                fee_paid=paid,
                fee_pending=pending,
                fee_status=fee_status,
                updated_at=f.get("updated_at"),
            )
        )

    return results


@router.get("/fees/my-fee", response_model=FeeResponse)
async def get_my_fee(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    """Allows authenticated Student to check their personal fee balance."""
    student_id = current_user.get("student_id") or current_user.get("username")
    fee = db.fees.find_one({"student_id": {"$regex": f"^{student_id}$", "$options": "i"}}, {"_id": 0})
    student = db.students.find_one({"student_id": {"$regex": f"^{student_id}$", "$options": "i"}}, {"_id": 0})

    if not fee and not student:
        raise HTTPException(status_code=404, detail="No fee record found for your account.")

    total = float(fee.get("fee_total", student.get("fee_total", 35000.0)) if fee else student.get("fee_total", 35000.0))
    paid = float(fee.get("fee_paid", student.get("fee_paid", 0.0)) if fee else student.get("fee_paid", 0.0))
    pending = max(0.0, total - paid)

    if paid >= total and total > 0:
        fee_status = "PAID"
    elif paid > 0:
        fee_status = "PARTIAL"
    else:
        fee_status = "PENDING"

    return FeeResponse(
        student_id=student_id,
        student_name=current_user.get("name", "Student"),
        email=current_user.get("email"),
        bus_id=current_user.get("assigned_bus") or (student.get("bus_id") if student else "BUS-01"),
        fee_total=total,
        fee_paid=paid,
        fee_pending=pending,
        fee_status=fee_status,
        updated_at=(fee.get("updated_at") if fee else None),
    )


@router.put("/fees/{student_id}")
@router.put("/students/{student_id}/fees")
async def update_student_fee(
    student_id: str,
    payload: FeeUpdate,
    admin: Dict[str, Any] = Depends(require_admin),
    db: Any = Depends(get_db),
):
    """
    Admin updates a student's fee allocation and payment:
    Validates paid <= total.
    Calculates pending = total - paid.
    Sets status: PAID / PARTIAL / PENDING.
    Synchronizes 'fees' and 'students' collections.
    """
    clean_id = student_id.upper()
    student = db.students.find_one({"student_id": clean_id})
    if not student:
        raise HTTPException(status_code=404, detail=f"Student '{clean_id}' not found.")

    total = float(payload.fee_total)
    paid = float(payload.fee_paid)

    if total < 0 or paid < 0:
        raise HTTPException(status_code=400, detail="Fee amounts cannot be negative.")

    if paid > total:
        raise HTTPException(status_code=400, detail="Paid amount cannot exceed total fee.")

    pending = max(0.0, total - paid)
    if paid >= total and total > 0:
        fee_status = "PAID"
    elif paid > 0:
        fee_status = "PARTIAL"
    else:
        fee_status = "PENDING"

    now = datetime.now(timezone.utc).isoformat()
    fee_data = {
        "student_id": clean_id,
        "student_name": student.get("name", "Student"),
        "email": student.get("email"),
        "bus_id": student.get("bus_id"),
        "fee_total": total,
        "fee_paid": paid,
        "fee_pending": pending,
        "fee_status": fee_status,
        "updated_at": now,
    }
    if payload.notes:
        fee_data["notes"] = payload.notes

    db.fees.update_one({"student_id": clean_id}, {"$set": fee_data}, upsert=True)
    db.students.update_one(
        {"student_id": clean_id},
        {"$set": {
            "fee_total": total,
            "fee_paid": paid,
            "fee_pending": pending,
            "fee_status": fee_status,
            "updated_at": now,
        }},
    )
    persist_mock_data()

    return {
        "message": f"Fee record updated for student {clean_id}.",
        "fee": fee_data,
    }
