import os
import sys
from datetime import datetime, timezone

# Ensure project root is in path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from backend.app.db import get_db, persist_mock_data
from backend.app.security import get_password_hash


def seed_database():
    """Initializes the database with verified demo accounts and transit fleet data."""
    print("Seeding Smart Bus Transit OS database...", flush=True)
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()

    # =========================================================================
    # 1. BUSES FLEET
    # =========================================================================
    buses_data = [
        {
            "bus_id": "BUS-01",
            "bus_number": "BUS-01",
            "registration_number": "KA-34-F-1102",
            "route": "Route A (Cantonment to Main Campus)",
            "capacity": 40,
            "passengers": 28,
            "driver_id": "driver1",
            "driver_name": "Rajesh Kumar",
            "status": "IN_TRANSIT",
            "latitude": 15.1394,
            "longitude": 76.9214,
            "speed": 36.2,
            "heading": 85.0,
            "area": "Ballari Cantonment",
            "city": "Ballari",
            "state": "Karnataka",
            "country": "India",
            "last_gps_time": now,
            "created_at": now,
            "updated_at": now,
        },
        {
            "bus_id": "BUS-03",
            "bus_number": "BUS-03",
            "registration_number": "KA-34-F-3341",
            "route": "Route B (Gandhi Nagar - Siruguppa Rd)",
            "capacity": 35,
            "passengers": 18,
            "driver_id": "driver2",
            "driver_name": "Suresh Patel",
            "status": "ACTIVE",
            "latitude": 15.1480,
            "longitude": 76.9280,
            "speed": 22.0,
            "heading": 120.0,
            "area": "Gandhi Nagar",
            "city": "Ballari",
            "state": "Karnataka",
            "country": "India",
            "last_gps_time": now,
            "created_at": now,
            "updated_at": now,
        },
        {
            "bus_id": "BUS-07",
            "bus_number": "BUS-07",
            "registration_number": "KA-34-F-7890",
            "route": "Route C (Railway Station to Campus Hub)",
            "capacity": 30,
            "passengers": 12,
            "driver_id": None,
            "driver_name": "Unassigned",
            "status": "ACTIVE",
            "latitude": 15.1250,
            "longitude": 76.9150,
            "speed": 0.0,
            "heading": 0.0,
            "area": "Railway Colony",
            "city": "Ballari",
            "state": "Karnataka",
            "country": "India",
            "last_gps_time": now,
            "created_at": now,
            "updated_at": now,
        },
    ]

    for b in buses_data:
        db.buses.update_one({"bus_id": b["bus_id"]}, {"$set": b}, upsert=True)
    print(f"✓ Fleet buses populated ({len(buses_data)} buses).", flush=True)

    # =========================================================================
    # 2. USERS (ADMIN, DRIVERS, STUDENTS)
    # =========================================================================
    users_data = [
        # ADMIN
        {
            "username": "admin",
            "name": "Transit Administrator",
            "email": "admin@smartbus.transit.org",
            "password_hash": get_password_hash("admin123"),
            "role": "ADMIN",
            "account_status": "ACTIVE",
            "created_at": now,
            "updated_at": now,
        },
        # DRIVER 1
        {
            "username": "driver1",
            "name": "Rajesh Kumar",
            "email": "rajesh.driver@smartbus.org",
            "phone": "+91 98765 43210",
            "password_hash": get_password_hash("driver123"),
            "role": "DRIVER",
            "assigned_bus": "BUS-01",
            "license_number": "KA-34-DL-2021-009",
            "account_status": "ACTIVE",
            "created_at": now,
            "updated_at": now,
        },
        # DRIVER 2
        {
            "username": "driver2",
            "name": "Suresh Patel",
            "email": "suresh.driver@smartbus.org",
            "phone": "+91 98765 87654",
            "password_hash": get_password_hash("driver234"),
            "role": "DRIVER",
            "assigned_bus": "BUS-03",
            "license_number": "KA-34-DL-2022-045",
            "account_status": "ACTIVE",
            "created_at": now,
            "updated_at": now,
        },
        # STUDENT 1 (deepak / student1)
        {
            "username": "student1",
            "name": "Deepak Kumar",
            "email": "deepak@smartbus.edu",
            "student_id": "3BR23CD016",
            "password_hash": get_password_hash("student123"),
            "role": "STUDENT",
            "assigned_bus": "BUS-01",
            "department": "Computer Science & Engineering",
            "account_status": "ACTIVE",
            "created_at": now,
            "updated_at": now,
        },
        # STUDENT 1 ID ALIAS
        {
            "username": "3BR23CD016",
            "name": "Deepak Kumar",
            "email": "deepak.cs@smartbus.edu",
            "student_id": "3BR23CD016",
            "password_hash": get_password_hash("student123"),
            "role": "STUDENT",
            "assigned_bus": "BUS-01",
            "department": "Computer Science & Engineering",
            "account_status": "ACTIVE",
            "created_at": now,
            "updated_at": now,
        },
        # STUDENT 2 (anita / student2)
        {
            "username": "student2",
            "name": "Anita Sharma",
            "email": "anita@smartbus.edu",
            "student_id": "3BR23EC045",
            "password_hash": get_password_hash("student123"),
            "role": "STUDENT",
            "assigned_bus": "BUS-03",
            "department": "Electronics & Communication",
            "account_status": "ACTIVE",
            "created_at": now,
            "updated_at": now,
        },
        # STUDENT 3
        {
            "username": "student3",
            "name": "Rahul Verma",
            "email": "rahul.me@smartbus.edu",
            "student_id": "3BR23ME012",
            "password_hash": get_password_hash("student123"),
            "role": "STUDENT",
            "assigned_bus": "BUS-01",
            "department": "Mechanical Engineering",
            "account_status": "ACTIVE",
            "created_at": now,
            "updated_at": now,
        },
    ]

    for u in users_data:
        db.users.update_one({"username": u["username"]}, {"$set": u}, upsert=True)
    print(f"✓ System user credentials populated ({len(users_data)} users).", flush=True)

    # =========================================================================
    # 3. STUDENTS PROFILES
    # =========================================================================
    students_data = [
        {
            "student_id": "3BR23CD016",
            "name": "Deepak Kumar",
            "email": "deepak@smartbus.edu",
            "phone": "+91 91234 56789",
            "department": "Computer Science & Engineering",
            "year": "2nd Year",
            "semester": "4th Sem",
            "bus_id": "BUS-01",
            "pickup_location": "Main Campus Gate",
            "fee_total": 35000.0,
            "fee_paid": 35000.0,
            "fee_pending": 0.0,
            "fee_status": "PAID",
            "account_status": "ACTIVE",
            "created_at": now,
            "updated_at": now,
        },
        {
            "student_id": "3BR23EC045",
            "name": "Anita Sharma",
            "email": "anita@smartbus.edu",
            "phone": "+91 98761 23456",
            "department": "Electronics & Communication",
            "year": "3rd Year",
            "semester": "6th Sem",
            "bus_id": "BUS-03",
            "pickup_location": "City Centre Circle",
            "fee_total": 38000.0,
            "fee_paid": 20000.0,
            "fee_pending": 18000.0,
            "fee_status": "PARTIAL",
            "account_status": "ACTIVE",
            "created_at": now,
            "updated_at": now,
        },
        {
            "student_id": "3BR23ME012",
            "name": "Rahul Verma",
            "email": "rahul.me@smartbus.edu",
            "phone": "+91 97654 32109",
            "department": "Mechanical Engineering",
            "year": "1st Year",
            "semester": "2nd Sem",
            "bus_id": "BUS-01",
            "pickup_location": "Railway Colony Circle",
            "fee_total": 32000.0,
            "fee_paid": 0.0,
            "fee_pending": 32000.0,
            "fee_status": "PENDING",
            "account_status": "ACTIVE",
            "created_at": now,
            "updated_at": now,
        },
    ]

    for s in students_data:
        db.students.update_one({"student_id": s["student_id"]}, {"$set": s}, upsert=True)
    print(f"✓ Student records populated ({len(students_data)} students).", flush=True)

    # =========================================================================
    # 4. FEE LEDGERS
    # =========================================================================
    fees_data = [
        {
            "student_id": "3BR23CD016",
            "student_name": "Deepak Kumar",
            "email": "deepak@smartbus.edu",
            "bus_id": "BUS-01",
            "fee_total": 35000.0,
            "fee_paid": 35000.0,
            "fee_pending": 0.0,
            "fee_status": "PAID",
            "updated_at": now,
        },
        {
            "student_id": "3BR23EC045",
            "student_name": "Anita Sharma",
            "email": "anita@smartbus.edu",
            "bus_id": "BUS-03",
            "fee_total": 38000.0,
            "fee_paid": 20000.0,
            "fee_pending": 18000.0,
            "fee_status": "PARTIAL",
            "updated_at": now,
        },
        {
            "student_id": "3BR23ME012",
            "student_name": "Rahul Verma",
            "email": "rahul.me@smartbus.edu",
            "bus_id": "BUS-01",
            "fee_total": 32000.0,
            "fee_paid": 0.0,
            "fee_pending": 32000.0,
            "fee_status": "PENDING",
            "updated_at": now,
        },
    ]

    for f in fees_data:
        db.fees.update_one({"student_id": f["student_id"]}, {"$set": f}, upsert=True)
    print(f"✓ Fee ledgers populated ({len(fees_data)} fee entries).", flush=True)

    persist_mock_data()

    print("\n" + "=" * 60)
    print(" SMART BUS TRANSIT SYSTEM - SEED COMPLETE")
    print("=" * 60)
    print(" DEMO CREDENTIALS:")
    print(" 1. ADMIN:   Username: admin    / Password: admin123")
    print(" 2. DRIVER:  Username: driver1  / Password: driver123")
    print(" 3. DRIVER:  Username: driver2  / Password: driver234")
    print(" 4. STUDENT: Username: student1 / Password: student123")
    print("    (Alias): Username: 3BR23CD016 / Password: student123")
    print(" 5. STUDENT: Username: student2 / Password: student123")
    print("=" * 60 + "\n", flush=True)


if __name__ == "__main__":
    seed_database()
