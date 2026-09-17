from typing import Optional, List, Dict, Any
from pydantic import BaseModel, EmailStr, Field


# --- AUTH MODELS ---
class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: str
    assigned_bus: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None


class UserProfileResponse(BaseModel):
    username: str
    role: str
    email: Optional[str] = None
    name: Optional[str] = None
    assigned_bus: Optional[str] = None
    student_id: Optional[str] = None
    department: Optional[str] = None
    phone: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


# --- STUDENT MODELS ---
class StudentCreate(BaseModel):
    student_id: str
    name: str
    email: EmailStr
    phone: Optional[str] = ""
    department: Optional[str] = "Computer Science"
    year: Optional[str] = "2nd Year"
    semester: Optional[str] = "4th Sem"
    bus_id: Optional[str] = "BUS-01"
    pickup_location: Optional[str] = "Main Campus Gate"
    fee_total: Optional[float] = 35000.0
    fee_paid: Optional[float] = 0.0


class StudentUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    year: Optional[str] = None
    semester: Optional[str] = None
    bus_id: Optional[str] = None
    pickup_location: Optional[str] = None
    account_status: Optional[str] = None


class StudentResponse(BaseModel):
    student_id: str
    name: str
    email: str
    phone: Optional[str] = ""
    department: Optional[str] = ""
    year: Optional[str] = ""
    semester: Optional[str] = ""
    bus_id: Optional[str] = ""
    pickup_location: Optional[str] = ""
    fee_total: float = 0.0
    fee_paid: float = 0.0
    fee_pending: float = 0.0
    fee_status: str = "PENDING"
    account_status: str = "ACTIVE"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


# --- FEE MODELS ---
class FeeUpdate(BaseModel):
    fee_total: float
    fee_paid: float
    notes: Optional[str] = None


class FeeResponse(BaseModel):
    student_id: str
    student_name: str
    email: Optional[str] = None
    bus_id: Optional[str] = None
    fee_total: float
    fee_paid: float
    fee_pending: float
    fee_status: str  # PAID, PARTIAL, PENDING
    updated_at: Optional[str] = None


# --- BUS MODELS ---
class BusCreate(BaseModel):
    bus_id: str
    bus_number: str
    registration_number: Optional[str] = ""
    route: Optional[str] = ""
    capacity: Optional[int] = 40
    passengers: Optional[int] = 0
    driver_id: Optional[str] = None
    driver_name: Optional[str] = None
    status: Optional[str] = "ACTIVE"


class BusUpdate(BaseModel):
    bus_number: Optional[str] = None
    registration_number: Optional[str] = None
    route: Optional[str] = None
    capacity: Optional[int] = None
    passengers: Optional[int] = None
    driver_id: Optional[str] = None
    driver_name: Optional[str] = None
    status: Optional[str] = None


class BusDriverAssign(BaseModel):
    driver_id: str
    driver_name: Optional[str] = None


class BusLocationResponse(BaseModel):
    bus_id: str
    bus_number: Optional[str] = None
    driver_name: Optional[str] = None
    latitude: float
    longitude: float
    speed: Optional[float] = 0.0
    heading: Optional[float] = 0.0
    area: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    status: Optional[str] = "ACTIVE"
    last_gps_time: Optional[str] = None
    passengers: Optional[int] = 0
    capacity: Optional[int] = 40
    available_seats: Optional[int] = 40


# --- GPS MODELS ---
class GPSUpdateRequest(BaseModel):
    bus_id: str
    latitude: float
    longitude: float
    speed: Optional[float] = 0.0
    heading: Optional[float] = 0.0
    status: Optional[str] = None
    timestamp: Optional[str] = None


# --- DRIVER MODELS ---
class DriverCreate(BaseModel):
    username: str
    name: str
    phone: Optional[str] = ""
    license_number: Optional[str] = ""
    assigned_bus: Optional[str] = None
    password: Optional[str] = "driver123"
