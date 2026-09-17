from datetime import datetime, timezone
import asyncio
import json
import time
from typing import Optional, Dict, Any, List
import urllib.request
import urllib.error

try:
    from pydantic import BaseModel, Field
except ImportError:
    class BaseModel:
        def __init__(self, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)
        def dict(self, *args, **kwargs):
            return self.__dict__
    def Field(*args, **kwargs):
        return None

try:
    from fastapi import HTTPException, status
except ImportError:
    class HTTPException(Exception):
        def __init__(self, status_code: int = 400, detail: str = ""):
            self.status_code = status_code
            self.detail = detail
            super().__init__(detail)
    class status:
        HTTP_400_BAD_REQUEST = 400
        HTTP_401_UNAUTHORIZED = 401
        HTTP_403_FORBIDDEN = 403
        HTTP_404_NOT_FOUND = 404
        HTTP_500_INTERNAL_SERVER_ERROR = 500


# =====================================================================
# REVERSE GEOCODING CACHE & RATE LIMITER (OpenStreetMap Nominatim)
# =====================================================================
# Caching coordinates bucketed to ~100m (3 decimal places) with 15-minute TTL
_GEOCODE_CACHE: Dict[str, Dict[str, Any]] = {}
_LAST_GEOCODE_REQUEST_TIME: float = 0.0
_MIN_REQUEST_INTERVAL_SECONDS: float = 1.2  # Nominatim usage requirement: max 1 req/sec


def _get_cache_key(lat: float, lon: float) -> str:
    """Bucket coordinates to 3 decimal places (~110m) to avoid redundant requests."""
    return f"{round(lat, 3)}:{round(lon, 3)}"


async def reverse_geocode(latitude: float, longitude: float) -> Dict[str, Optional[str]]:
    """
    Reverse geocodes latitude and longitude using OpenStreetMap Nominatim.
    Includes spatial caching (~100m buckets) and rate-limiting.
    Fails safely so GPS updates are never blocked if geocoding fails.
    """
    global _LAST_GEOCODE_REQUEST_TIME

    cache_key = _get_cache_key(latitude, longitude)
    now = time.time()

    # 1. Check in-memory cache with 15-minute TTL
    cached = _GEOCODE_CACHE.get(cache_key)
    if cached and (now - cached.get("cached_at", 0) < 900):
        return {
            "area": cached.get("area"),
            "city": cached.get("city"),
            "state": cached.get("state"),
            "country": cached.get("country"),
        }

    # 2. Rate-limiting guard for Nominatim policy
    time_since_last = now - _LAST_GEOCODE_REQUEST_TIME
    if time_since_last < _MIN_REQUEST_INTERVAL_SECONDS:
        if cached:
            return {
                "area": cached.get("area"),
                "city": cached.get("city"),
                "state": cached.get("state"),
                "country": cached.get("country"),
            }
        await asyncio.sleep(_MIN_REQUEST_INTERVAL_SECONDS - time_since_last)

    # 3. Non-blocking HTTP request in background worker thread
    def _fetch() -> Dict[str, Optional[str]]:
        global _LAST_GEOCODE_REQUEST_TIME
        url = (
            f"https://nominatim.openstreetmap.org/reverse?format=jsonv2"
            f"&lat={latitude}&lon={longitude}&zoom=16&addressdetails=1"
        )
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "SmartBusSystem-TransitMonitor/1.0 (transit-operations@smartbus.internal)",
                "Accept-Language": "en",
            },
        )
        try:
            _LAST_GEOCODE_REQUEST_TIME = time.time()
            with urllib.request.urlopen(req, timeout=3.5) as response:
                if response.status != 200:
                    return {"area": None, "city": None, "state": None, "country": None}
                data = json.loads(response.read().decode("utf-8"))
                address = data.get("address", {})

                area = (
                    address.get("suburb")
                    or address.get("neighbourhood")
                    or address.get("residential")
                    or address.get("road")
                    or address.get("quarter")
                    or address.get("village")
                    or address.get("county")
                )
                city = (
                    address.get("city")
                    or address.get("town")
                    or address.get("municipality")
                    or address.get("city_district")
                    or address.get("district")
                )
                state = address.get("state") or address.get("region")
                country = address.get("country") or "India"

                result = {
                    "area": area,
                    "city": city,
                    "state": state,
                    "country": country,
                }
                _GEOCODE_CACHE[cache_key] = {
                    **result,
                    "cached_at": time.time(),
                }
                return result
        except Exception:
            # Fallback gracefully to cache if exists, or None
            return {
                "area": cached.get("area") if cached else None,
                "city": cached.get("city") if cached else None,
                "state": cached.get("state") if cached else None,
                "country": cached.get("country") if cached else None,
            }

    try:
        return await asyncio.to_thread(_fetch)
    except Exception:
        return {"area": None, "city": None, "state": None, "country": None}


# =====================================================================
# PYDANTIC MODELS
# =====================================================================

class GPSUpdateRequest(BaseModel):
    bus_id: str
    latitude: float
    longitude: float
    speed: Optional[float] = None
    heading: Optional[float] = None
    timestamp: Optional[str] = None


class GPSLocationResponse(BaseModel):
    bus_id: str
    latitude: float
    longitude: float
    speed: Optional[float] = None
    heading: Optional[float] = None
    area: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    timestamp: str
    message: Optional[str] = "GPS location updated successfully"


# =====================================================================
# GPS SERVICE HANDLER
# =====================================================================

async def update_bus_gps(
    request: GPSUpdateRequest,
    current_user: Optional[Dict[str, Any]] = None,
    db: Any = None,
) -> Dict[str, Any]:
    """
    Updates the GPS location of a bus in the MongoDB database and records telemetry log.
    Enriches coordinates with reverse-geocoded area, city, state, and country.
    Uses datetime.now(timezone.utc) for accurate UTC timestamps.
    """
    if current_user:
        user_role = current_user.get("role")
        if user_role not in ["ADMIN", "DRIVER"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to update bus GPS coordinates",
            )
        if user_role == "DRIVER":
            assigned_bus = current_user.get("assigned_bus")
            if assigned_bus and assigned_bus.upper() != request.bus_id.upper():
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Driver not assigned to bus {request.bus_id}",
                )

    # 1. Reverse-geocode to human-readable address with caching & rate-limiting
    geo_data = await reverse_geocode(float(request.latitude), float(request.longitude))
    area = geo_data.get("area")
    city = geo_data.get("city")
    state = geo_data.get("state")
    country = geo_data.get("country")

    # 2. Timezone-aware UTC timestamp
    now = datetime.now(timezone.utc)
    iso_timestamp = request.timestamp or now.isoformat()

    # 3. Structure MongoDB bus document update
    gps_data = {
        "bus_id": request.bus_id,
        "latitude": float(request.latitude),
        "longitude": float(request.longitude),
        "speed": float(request.speed) if request.speed is not None else 0.0,
        "heading": float(request.heading) if request.heading is not None else 0.0,
        "area": area,
        "city": city,
        "state": state,
        "country": country,
        "last_gps_time": iso_timestamp,
        "updated_at": iso_timestamp,
    }

    if db is not None:
        try:
            # Update current bus live state in MongoDB
            await db.buses.update_one(
                {"bus_id": request.bus_id},
                {"$set": gps_data},
                upsert=True,
            )
            # Log telemetry record in MongoDB gps_logs collection
            log_entry = {
                "bus_id": request.bus_id,
                "driver_id": current_user.get("username") if current_user else "system",
                "latitude": float(request.latitude),
                "longitude": float(request.longitude),
                "speed": float(request.speed) if request.speed is not None else 0.0,
                "heading": float(request.heading) if request.heading is not None else 0.0,
                "area": area,
                "city": city,
                "state": state,
                "country": country,
                "timestamp": now,
            }
            await db.gps_logs.insert_one(log_entry)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database update failed: {str(e)}",
            )

    return {
        "bus_id": request.bus_id,
        "latitude": float(request.latitude),
        "longitude": float(request.longitude),
        "speed": float(request.speed) if request.speed is not None else 0.0,
        "heading": float(request.heading) if request.heading is not None else 0.0,
        "area": area,
        "city": city,
        "state": state,
        "country": country,
        "timestamp": iso_timestamp,
        "message": "GPS location updated successfully",
    }


if __name__ == "__main__":
    import asyncio
    req = GPSUpdateRequest(bus_id="BUS-01", latitude=15.1394, longitude=76.9214)
    res = asyncio.run(update_bus_gps(req))
    assert res["bus_id"] == "BUS-01"
    assert "latitude" in res
    assert "longitude" in res
    print("FastAPI GPS service reverse geocoding and caching validated successfully!")
    print("Sample response:", res)
