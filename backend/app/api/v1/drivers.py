from datetime import datetime, timezone
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from backend.app.db import get_db, persist_mock_data
from backend.app.security import require_admin, get_password_hash
from backend.app.models import DriverCreate

router = APIRouter(prefix="/drivers", tags=["Drivers"])


@router.get("")
async def list_drivers(
    admin: Dict[str, Any] = Depends(require_admin),
    db: Any = Depends(get_db),
):
    """Admin endpoint to list all drivers and their assigned buses."""
    drivers = list(db.users.find({"role": "DRIVER"}, {"password_hash": 0, "_id": 0}))
    return drivers


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_driver(
    payload: DriverCreate,
    admin: Dict[str, Any] = Depends(require_admin),
    db: Any = Depends(get_db),
):
    """Admin registers a driver user in the system."""
    clean_username = payload.username.strip().lower()
    if db.users.find_one({"username": clean_username}):
        raise HTTPException(status_code=400, detail="Username already in use.")

    now = datetime.now(timezone.utc).isoformat()
    password = payload.password or "driver123"
    doc = {
        "username": clean_username,
        "name": payload.name.strip(),
        "phone": payload.phone or "",
        "license_number": payload.license_number or "",
        "assigned_bus": payload.assigned_bus,
        "role": "DRIVER",
        "password_hash": get_password_hash(password),
        "account_status": "ACTIVE",
        "created_at": now,
        "updated_at": now,
    }
    db.users.insert_one(doc)

    # If assigned_bus provided, update bus record too
    if payload.assigned_bus:
        db.buses.update_one(
            {"bus_id": payload.assigned_bus.upper()},
            {"$set": {"driver_id": clean_username, "driver_name": payload.name.strip(), "updated_at": now}},
        )

    persist_mock_data()
    return {"message": f"Driver '{payload.name}' registered successfully.", "driver": {
        "username": clean_username,
        "name": payload.name,
        "assigned_bus": payload.assigned_bus,
    }}
