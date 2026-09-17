from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from backend.app.db import get_db, persist_mock_data
from backend.app.security import get_current_user, require_admin, require_driver
from backend.app.services.smart_bus import reverse_geocode
from backend.app.models import (
    BusCreate,
    BusUpdate,
    BusDriverAssign,
    BusLocationResponse,
    GPSUpdateRequest,
)

router = APIRouter(tags=["Buses & GPS"])


@router.get("/buses")
async def list_buses(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    """Lists all fleet buses with active status, capacity, occupancy, and current GPS coords."""
    buses = list(db.buses.find({}, {"_id": 0}))
    results = []
    for b in buses:
        capacity = int(b.get("capacity", 40))
        passengers = int(b.get("passengers", 0))
        available = max(0, capacity - passengers)
        results.append({
            "bus_id": b.get("bus_id"),
            "bus_number": b.get("bus_number") or b.get("bus_id"),
            "registration_number": b.get("registration_number", ""),
            "route": b.get("route", ""),
            "capacity": capacity,
            "passengers": passengers,
            "available_seats": available,
            "driver_id": b.get("driver_id"),
            "driver_name": b.get("driver_name"),
            "status": b.get("status", "ACTIVE"),
            "latitude": float(b.get("latitude", 15.1394)),
            "longitude": float(b.get("longitude", 76.9214)),
            "speed": float(b.get("speed", 0.0)),
            "heading": float(b.get("heading", 0.0)),
            "area": b.get("area"),
            "city": b.get("city"),
            "state": b.get("state"),
            "country": b.get("country"),
            "last_gps_time": b.get("last_gps_time") or b.get("updated_at"),
        })
    return results


@router.post("/buses", status_code=status.HTTP_201_CREATED)
async def create_bus(
    payload: BusCreate,
    admin: Dict[str, Any] = Depends(require_admin),
    db: Any = Depends(get_db),
):
    """Admin registers a new bus in the fleet."""
    clean_id = payload.bus_id.strip().upper()
    if db.buses.find_one({"bus_id": clean_id}):
        raise HTTPException(status_code=400, detail=f"Bus '{clean_id}' already exists.")

    driver_name = payload.driver_name
    if payload.driver_id and not driver_name:
        driver = db.drivers.find_one({"username": payload.driver_id}) or db.users.find_one({"username": payload.driver_id})
        if driver:
            driver_name = driver.get("name", payload.driver_id)

    now = datetime.now(timezone.utc).isoformat()
    bus_doc = {
        "bus_id": clean_id,
        "bus_number": payload.bus_number.strip(),
        "registration_number": payload.registration_number or "",
        "route": payload.route or "Campus Main Express",
        "capacity": payload.capacity or 40,
        "passengers": payload.passengers or 0,
        "driver_id": payload.driver_id,
        "driver_name": driver_name,
        "status": payload.status or "ACTIVE",
        "latitude": 15.1394,
        "longitude": 76.9214,
        "speed": 0.0,
        "heading": 0.0,
        "area": "Campus Hub",
        "city": "Ballari",
        "state": "Karnataka",
        "country": "India",
        "last_gps_time": now,
        "created_at": now,
        "updated_at": now,
    }
    db.buses.insert_one(bus_doc)
    persist_mock_data()
    return {"message": f"Bus '{clean_id}' registered successfully.", "bus": bus_doc}


@router.get("/buses/{bus_id}")
async def get_bus(
    bus_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    """Retrieves bus specifications, seating occupancy, and live telemetry."""
    bus = db.buses.find_one({"bus_id": bus_id.upper()}, {"_id": 0})
    if not bus:
        raise HTTPException(status_code=404, detail="Bus not found.")
    capacity = int(bus.get("capacity", 40))
    passengers = int(bus.get("passengers", 0))
    bus["available_seats"] = max(0, capacity - passengers)
    return bus


@router.put("/buses/{bus_id}")
async def update_bus(
    bus_id: str,
    payload: BusUpdate,
    admin: Dict[str, Any] = Depends(require_admin),
    db: Any = Depends(get_db),
):
    """Updates fleet bus specifications, route, or driver assignment."""
    clean_id = bus_id.upper()
    existing = db.buses.find_one({"bus_id": clean_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Bus not found.")

    updates: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if payload.bus_number is not None:
        updates["bus_number"] = payload.bus_number
    if payload.registration_number is not None:
        updates["registration_number"] = payload.registration_number
    if payload.route is not None:
        updates["route"] = payload.route
    if payload.capacity is not None:
        updates["capacity"] = payload.capacity
    if payload.passengers is not None:
        updates["passengers"] = payload.passengers
    if payload.status is not None:
        updates["status"] = payload.status
    if payload.driver_id is not None:
        updates["driver_id"] = payload.driver_id
        driver = db.drivers.find_one({"username": payload.driver_id}) or db.users.find_one({"username": payload.driver_id})
        if driver:
            updates["driver_name"] = driver.get("name", payload.driver_id)
            # Sync driver's assigned_bus
            db.users.update_one({"username": payload.driver_id}, {"$set": {"assigned_bus": clean_id}})

    db.buses.update_one({"bus_id": clean_id}, {"$set": updates})
    persist_mock_data()
    return {"message": "Bus updated successfully."}


@router.delete("/buses/{bus_id}")
async def delete_bus(
    bus_id: str,
    admin: Dict[str, Any] = Depends(require_admin),
    db: Any = Depends(get_db),
):
    """Deletes a bus from the fleet registry."""
    clean_id = bus_id.upper()
    if not db.buses.find_one({"bus_id": clean_id}):
        raise HTTPException(status_code=404, detail="Bus not found.")
    db.buses.delete_one({"bus_id": clean_id})
    persist_mock_data()
    return {"message": f"Bus '{clean_id}' deleted from fleet."}


@router.put("/buses/{bus_id}/driver")
async def assign_driver(
    bus_id: str,
    payload: BusDriverAssign,
    admin: Dict[str, Any] = Depends(require_admin),
    db: Any = Depends(get_db),
):
    """Assigns a verified driver to a bus."""
    clean_id = bus_id.upper()
    bus = db.buses.find_one({"bus_id": clean_id})
    if not bus:
        raise HTTPException(status_code=404, detail="Bus not found.")

    driver = db.users.find_one({"username": payload.driver_id, "role": "DRIVER"}) or db.drivers.find_one({"username": payload.driver_id})
    driver_name = payload.driver_name or (driver.get("name") if driver else payload.driver_id)

    now = datetime.now(timezone.utc).isoformat()
    db.buses.update_one(
        {"bus_id": clean_id},
        {"$set": {"driver_id": payload.driver_id, "driver_name": driver_name, "updated_at": now}},
    )
    db.users.update_one(
        {"username": payload.driver_id},
        {"$set": {"assigned_bus": clean_id, "updated_at": now}},
    )
    persist_mock_data()
    return {"message": f"Driver '{driver_name}' assigned to bus '{clean_id}'."}


@router.get("/buses/{bus_id}/location")
async def get_bus_location(
    bus_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    """Returns the real-time coordinates, reverse-geocoded location, and status of a bus."""
    bus = db.buses.find_one({"bus_id": bus_id.upper()}, {"_id": 0})
    if not bus:
        raise HTTPException(status_code=404, detail="Bus not found.")

    capacity = int(bus.get("capacity", 40))
    passengers = int(bus.get("passengers", 0))

    return {
        "bus_id": bus.get("bus_id"),
        "bus_number": bus.get("bus_number") or bus.get("bus_id"),
        "driver_name": bus.get("driver_name"),
        "latitude": float(bus.get("latitude", 15.1394)),
        "longitude": float(bus.get("longitude", 76.9214)),
        "speed": float(bus.get("speed", 0.0)),
        "heading": float(bus.get("heading", 0.0)),
        "area": bus.get("area"),
        "city": bus.get("city"),
        "state": bus.get("state"),
        "country": bus.get("country"),
        "status": bus.get("status", "ACTIVE"),
        "last_gps_time": bus.get("last_gps_time") or bus.get("updated_at"),
        "capacity": capacity,
        "passengers": passengers,
        "available_seats": max(0, capacity - passengers),
    }


# GPS UPDATES FROM DRIVER
async def _process_gps_update(
    request: GPSUpdateRequest,
    current_user: Dict[str, Any],
    db: Any,
) -> Dict[str, Any]:
    """Helper to enrich GPS coordinates with reverse geocoding and persist telemetry."""
    user_role = current_user.get("role")
    bus_id = request.bus_id.upper()

    if user_role not in ["ADMIN", "DRIVER"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers and admins may update bus GPS coordinates.",
        )

    if user_role == "DRIVER":
        assigned_bus = current_user.get("assigned_bus")
        if assigned_bus and assigned_bus.upper() != bus_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You are assigned to {assigned_bus}, not {bus_id}.",
            )

    # Reverse geocode asynchronously
    geo = await reverse_geocode(request.latitude, request.longitude)
    area = geo.get("area") or "Transit Corridor"
    city = geo.get("city") or "Campus Area"
    state = geo.get("state") or "Karnataka"
    country = geo.get("country") or "India"

    now = datetime.now(timezone.utc).isoformat()
    bus_update = {
        "bus_id": bus_id,
        "latitude": float(request.latitude),
        "longitude": float(request.longitude),
        "speed": float(request.speed or 0.0),
        "heading": float(request.heading or 0.0),
        "area": area,
        "city": city,
        "state": state,
        "country": country,
        "last_gps_time": now,
        "updated_at": now,
    }
    if request.status:
        bus_update["status"] = request.status

    db.buses.update_one({"bus_id": bus_id}, {"$set": bus_update}, upsert=True)

    # Save to gps_locations collection as required by schema
    db.gps_locations.update_one(
        {"bus_id": bus_id},
        {"$set": {
            "bus_id": bus_id,
            "latitude": float(request.latitude),
            "longitude": float(request.longitude),
            "speed": float(request.speed or 0.0),
            "heading": float(request.heading or 0.0),
            "area": area,
            "city": city,
            "timestamp": now,
        }},
        upsert=True,
    )

    # Log telemetry entry
    db.gps_logs.insert_one({
        "bus_id": bus_id,
        "driver_id": current_user.get("username"),
        "latitude": float(request.latitude),
        "longitude": float(request.longitude),
        "speed": float(request.speed or 0.0),
        "heading": float(request.heading or 0.0),
        "area": area,
        "city": city,
        "timestamp": now,
    })
    persist_mock_data()

    return {
        "bus_id": bus_id,
        "latitude": float(request.latitude),
        "longitude": float(request.longitude),
        "speed": float(request.speed or 0.0),
        "heading": float(request.heading or 0.0),
        "area": area,
        "city": city,
        "state": state,
        "country": country,
        "timestamp": now,
        "message": "GPS location updated successfully.",
    }


@router.post("/buses/{bus_id}/location")
async def update_bus_location(
    bus_id: str,
    payload: GPSUpdateRequest,
    current_user: Dict[str, Any] = Depends(require_driver),
    db: Any = Depends(get_db),
):
    """Standard REST endpoint for bus GPS telemetry update."""
    payload.bus_id = bus_id
    return await _process_gps_update(payload, current_user, db)


@router.post("/smart-bus/gps")
async def driver_gps_update(
    payload: GPSUpdateRequest,
    current_user: Dict[str, Any] = Depends(require_driver),
    db: Any = Depends(get_db),
):
    """Endpoint matching frontend DriverGPS client component."""
    return await _process_gps_update(payload, current_user, db)


@router.get("/smart-bus/my-bus/location")
async def get_my_bus_location(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    """
    Returns the real-time location of the bus assigned to the authenticated Student or Driver.
    """
    assigned_bus = current_user.get("assigned_bus")

    # If student, check student record
    if not assigned_bus and current_user.get("student_id"):
        s = db.students.find_one({"student_id": current_user.get("student_id")})
        if s:
            assigned_bus = s.get("bus_id")

    if not assigned_bus:
        # Fallback to first active bus for demo purposes
        first_bus = db.buses.find_one({}, {"_id": 0})
        if first_bus:
            assigned_bus = first_bus.get("bus_id")

    if not assigned_bus:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No bus has been assigned to your profile yet.",
        )

    bus = db.buses.find_one({"bus_id": assigned_bus.upper()}, {"_id": 0})
    if not bus:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assigned bus '{assigned_bus}' not found in fleet records.",
        )

    capacity = int(bus.get("capacity", 40))
    passengers = int(bus.get("passengers", 0))

    return {
        "bus_id": bus.get("bus_id"),
        "bus_number": bus.get("bus_number") or bus.get("bus_id"),
        "driver_name": bus.get("driver_name", "Assigned Driver"),
        "driver_id": bus.get("driver_id"),
        "latitude": float(bus.get("latitude", 15.1394)),
        "longitude": float(bus.get("longitude", 76.9214)),
        "speed": float(bus.get("speed", 0.0)),
        "heading": float(bus.get("heading", 0.0)),
        "area": bus.get("area"),
        "city": bus.get("city"),
        "state": bus.get("state"),
        "country": bus.get("country"),
        "status": bus.get("status", "ACTIVE"),
        "last_gps_time": bus.get("last_gps_time") or bus.get("updated_at"),
        "capacity": capacity,
        "passengers": passengers,
        "available_seats": max(0, capacity - passengers),
    }
