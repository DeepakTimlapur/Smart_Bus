import { MongoClient, Db, Collection } from "mongodb"
import bcrypt from "bcryptjs"

export interface UserDoc {
  username: string
  name: string
  email: string
  password_hash: string
  role: "ADMIN" | "DRIVER" | "STUDENT"
  assigned_bus?: string | null
  student_id?: string | null
  department?: string | null
  phone?: string | null
  account_status?: string
  created_at: string
  updated_at: string
}

export interface StudentDoc {
  student_id: string
  name: string
  email: string
  phone: string
  department: string
  year: string
  semester: string
  bus_id: string
  pickup_location: string
  fee_total: number
  fee_paid: number
  fee_pending: number
  fee_status: "PAID" | "PARTIAL" | "PENDING"
  fee_valid_until: string
  account_status: "ACTIVE" | "SUSPENDED"
  is_boarded?: boolean
  created_at: string
  updated_at: string
}

export interface DriverDoc {
  username: string
  name: string
  email: string
  phone: string
  license_number: string
  assigned_bus: string | null
  account_status: "ACTIVE" | "INACTIVE"
  created_at: string
  updated_at: string
}

export interface BusDoc {
  bus_id: string
  bus_number: string
  bus_name: string
  registration_number: string
  plate_number: string
  route: string
  stops: string[]
  capacity: number
  passengers: number
  driver_id: string | null
  driver_name: string | null
  status: "ACTIVE" | "IN_TRANSIT" | "MAINTENANCE"
  latitude: number
  longitude: number
  speed: number
  heading: number
  area: string
  city: string
  state: string
  country: string
  assigned_students?: string[]
  last_gps_time: string
  created_at: string
  updated_at: string
}

export interface FeeDoc {
  student_id: string
  student_name: string
  email: string
  bus_id: string
  academic_year: string
  fee_total: number
  fee_paid: number
  fee_pending: number
  fee_status: "PAID" | "PARTIAL" | "PENDING"
  payment_date: string | null
  valid_until: string | null
  updated_at: string
}

export interface AttendanceDoc {
  student_id: string
  name: string
  bus_id: string
  route: string
  driver: string
  plate_number: string
  stop: string
  fee_status: string
  event_type: "BOARDED" | "EXITED" | "DENIED"
  status: "BOARDED" | "EXITED" | "DENIED"
  date: string
  time: string
  timestamp: string
}

export interface GpsLocationDoc {
  busId: string
  bus_id?: string
  latitude: number
  longitude: number
  speed: number
  heading: number
  route: string
  driverId?: string | null
  driver_id?: string | null
  area?: string
  city?: string
  state?: string
  country?: string
  timestamp: string
}

// Next.js MongoDB client reuse singleton pattern
declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined
}

const DEFAULT_DB = process.env.MONGODB_DB || "smart_bus"

function getMongoUri(): string {
  return process.env.MONGODB_URI || "mongodb://localhost:27017"
}

export function getMongoClientPromise(): Promise<MongoClient> {
  const uri = getMongoUri()
  if (global._mongoClientPromise) {
    return global._mongoClientPromise
  }

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 2000,
    connectTimeoutMS: 3000,
  })

  global._mongoClientPromise = client.connect()
  return global._mongoClientPromise
}

// Memory fallback store for environments where MongoDB is temporarily offline or unconfigured
class MemoryDataStore {
  users: Map<string, UserDoc> = new Map()
  students: Map<string, StudentDoc> = new Map()
  drivers: Map<string, DriverDoc> = new Map()
  buses: Map<string, BusDoc> = new Map()
  fees: Map<string, FeeDoc> = new Map()
  attendance: AttendanceDoc[] = []
  gpsLocations: GpsLocationDoc[] = []
  initialized = false

  async seed() {
    if (this.initialized) return
    const initialUsers: UserDoc[] = [
      {
        username: "admin",
        name: "Transit Administrator",
        email: "admin@smartbus.transit.org",
        password_hash: await bcrypt.hash("admin123", 10),
        role: "ADMIN",
        assigned_bus: null,
        student_id: null,
        department: "Operations",
        phone: "+91 80000 00001",
        account_status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        username: "driver1",
        name: "Rajesh Kumar",
        email: "driver1@smartbus.transit.org",
        password_hash: await bcrypt.hash("driver123", 10),
        role: "DRIVER",
        assigned_bus: "BUS-01",
        phone: "+91 98888 11111",
        account_status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        username: "driver2",
        name: "Suresh Patel",
        email: "driver2@smartbus.transit.org",
        password_hash: await bcrypt.hash("driver123", 10),
        role: "DRIVER",
        assigned_bus: "BUS-03",
        phone: "+91 98888 22222",
        account_status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        username: "student1",
        name: "Deepak Kumar",
        email: "deepak@smartbus.edu",
        password_hash: await bcrypt.hash("student123", 10),
        role: "STUDENT",
        student_id: "3BR23CD016",
        assigned_bus: "BUS-01",
        department: "Computer Science & Engineering",
        phone: "+91 91234 56789",
        account_status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        username: "3BR23CD016",
        name: "Deepak Kumar",
        email: "deepak@smartbus.edu",
        password_hash: await bcrypt.hash("student123", 10),
        role: "STUDENT",
        student_id: "3BR23CD016",
        assigned_bus: "BUS-01",
        department: "Computer Science & Engineering",
        phone: "+91 91234 56789",
        account_status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        username: "3BR23EC045",
        name: "Anita Sharma",
        email: "anita@smartbus.edu",
        password_hash: await bcrypt.hash("student123", 10),
        role: "STUDENT",
        student_id: "3BR23EC045",
        assigned_bus: "BUS-03",
        department: "Electronics & Communication",
        phone: "+91 98761 23456",
        account_status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        username: "3BR23ME012",
        name: "Rahul Verma",
        email: "rahul.me@smartbus.edu",
        password_hash: await bcrypt.hash("student123", 10),
        role: "STUDENT",
        student_id: "3BR23ME012",
        assigned_bus: "BUS-01",
        department: "Mechanical Engineering",
        phone: "+91 97654 32109",
        account_status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        username: "3BR23CS089",
        name: "Kiran Kumar",
        email: "kiran@smartbus.edu",
        password_hash: await bcrypt.hash("student123", 10),
        role: "STUDENT",
        student_id: "3BR23CS089",
        assigned_bus: "BUS-03",
        department: "Computer Science & Engineering",
        phone: "+91 98765 00001",
        account_status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]
    for (const u of initialUsers) {
      this.users.set(u.username, u)
    }

    const initialStudents: StudentDoc[] = [
      {
        student_id: "3BR23CD016",
        name: "Deepak Kumar",
        email: "deepak@smartbus.edu",
        phone: "+91 91234 56789",
        department: "Computer Science & Engineering",
        year: "2nd Year",
        semester: "4th Sem",
        bus_id: "BUS-01",
        pickup_location: "Main Campus Gate",
        fee_total: 35000,
        fee_paid: 35000,
        fee_pending: 0,
        fee_status: "PAID",
        fee_valid_until: "2027-05-31",
        account_status: "ACTIVE",
        is_boarded: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        student_id: "3BR23EC045",
        name: "Anita Sharma",
        email: "anita@smartbus.edu",
        phone: "+91 98761 23456",
        department: "Electronics & Communication",
        year: "3rd Year",
        semester: "6th Sem",
        bus_id: "BUS-03",
        pickup_location: "City Centre Circle",
        fee_total: 38000,
        fee_paid: 20000,
        fee_pending: 18000,
        fee_status: "PARTIAL",
        fee_valid_until: "2027-05-31",
        account_status: "ACTIVE",
        is_boarded: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        student_id: "3BR23ME012",
        name: "Rahul Verma",
        email: "rahul.me@smartbus.edu",
        phone: "+91 97654 32109",
        department: "Mechanical Engineering",
        year: "1st Year",
        semester: "2nd Sem",
        bus_id: "BUS-01",
        pickup_location: "Railway Colony Circle",
        fee_total: 32000,
        fee_paid: 0,
        fee_pending: 32000,
        fee_status: "PENDING",
        fee_valid_until: "2026-01-01", // expired
        account_status: "ACTIVE",
        is_boarded: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        student_id: "3BR23CS089",
        name: "Kiran Kumar",
        email: "kiran@smartbus.edu",
        phone: "+91 98765 00001",
        department: "Computer Science & Engineering",
        year: "2nd Year",
        semester: "3rd Sem",
        bus_id: "BUS-03",
        pickup_location: "DC Office",
        fee_total: 35000,
        fee_paid: 0,
        fee_pending: 35000,
        fee_status: "PENDING",
        fee_valid_until: "2026-05-31",
        account_status: "ACTIVE",
        is_boarded: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]
    for (const s of initialStudents) {
      this.students.set(s.student_id, s)
    }

    const initialDrivers: DriverDoc[] = [
      {
        username: "driver1",
        name: "Rajesh Kumar",
        email: "driver1@smartbus.transit.org",
        phone: "+91 98888 11111",
        license_number: "KA-34-DL-98211",
        assigned_bus: "BUS-01",
        account_status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        username: "driver2",
        name: "Suresh Patel",
        email: "driver2@smartbus.transit.org",
        phone: "+91 98888 22222",
        license_number: "KA-34-DL-77402",
        assigned_bus: "BUS-03",
        account_status: "ACTIVE",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]
    for (const d of initialDrivers) {
      this.drivers.set(d.username, d)
    }

    const initialBuses: BusDoc[] = [
      {
        bus_id: "BUS-01",
        bus_number: "BUS-01",
        bus_name: "BUS-01 (Route A — Cantonment to Main Campus)",
        registration_number: "KA-34-F-1102",
        plate_number: "KA-34-F-1102",
        route: "Route A (Cantonment to Main Campus)",
        stops: ["Main Campus Gate", "City Circle", "Bus Terminal"],
        capacity: 40,
        passengers: 28,
        driver_id: "driver1",
        driver_name: "Rajesh Kumar",
        status: "IN_TRANSIT",
        latitude: 15.1394,
        longitude: 76.9214,
        speed: 36.2,
        heading: 85,
        area: "Ballari Cantonment",
        city: "Ballari",
        state: "Karnataka",
        country: "India",
        last_gps_time: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        bus_id: "BUS-03",
        bus_number: "BUS-03",
        bus_name: "BUS-03 (Route B — Gandhi Nagar to Siruguppa Rd)",
        registration_number: "KA-34-F-3341",
        plate_number: "KA-34-F-3341",
        route: "Route B (Gandhi Nagar - Siruguppa Rd)",
        stops: ["Main Campus Gate", "DC Office", "Siruguppa Cross"],
        capacity: 35,
        passengers: 18,
        driver_id: "driver2",
        driver_name: "Suresh Patel",
        status: "ACTIVE",
        latitude: 15.148,
        longitude: 76.928,
        speed: 22.0,
        heading: 120,
        area: "Gandhi Nagar",
        city: "Ballari",
        state: "Karnataka",
        country: "India",
        last_gps_time: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        bus_id: "BUS-07",
        bus_number: "BUS-07",
        bus_name: "BUS-07 (Route C — Railway Station to Campus Hub)",
        registration_number: "KA-34-F-7890",
        plate_number: "KA-34-F-7890",
        route: "Route C (Railway Station to Campus Hub)",
        stops: ["Railway Colony", "City Center", "Campus Hub"],
        capacity: 30,
        passengers: 12,
        driver_id: null,
        driver_name: "Unassigned",
        status: "ACTIVE",
        latitude: 15.125,
        longitude: 76.915,
        speed: 0,
        heading: 0,
        area: "Railway Colony",
        city: "Ballari",
        state: "Karnataka",
        country: "India",
        last_gps_time: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]
    for (const b of initialBuses) {
      this.buses.set(b.bus_id, b)
    }

    const initialFees: FeeDoc[] = [
      {
        student_id: "3BR23CD016",
        student_name: "Deepak Kumar",
        email: "deepak@smartbus.edu",
        bus_id: "BUS-01",
        academic_year: "2026-2027",
        fee_total: 35000,
        fee_paid: 35000,
        fee_pending: 0,
        fee_status: "PAID",
        payment_date: "2026-08-15",
        valid_until: "2027-05-31",
        updated_at: new Date().toISOString(),
      },
      {
        student_id: "3BR23EC045",
        student_name: "Anita Sharma",
        email: "anita@smartbus.edu",
        bus_id: "BUS-03",
        academic_year: "2026-2027",
        fee_total: 38000,
        fee_paid: 20000,
        fee_pending: 18000,
        fee_status: "PARTIAL",
        payment_date: "2026-08-20",
        valid_until: "2027-05-31",
        updated_at: new Date().toISOString(),
      },
      {
        student_id: "3BR23ME012",
        student_name: "Rahul Verma",
        email: "rahul.me@smartbus.edu",
        bus_id: "BUS-01",
        academic_year: "2026-2027",
        fee_total: 32000,
        fee_paid: 0,
        fee_pending: 32000,
        fee_status: "PENDING",
        payment_date: null,
        valid_until: "2026-01-01",
        updated_at: new Date().toISOString(),
      },
      {
        student_id: "3BR23CS089",
        student_name: "Kiran Kumar",
        email: "kiran@smartbus.edu",
        bus_id: "BUS-03",
        academic_year: "2026-2027",
        fee_total: 35000,
        fee_paid: 0,
        fee_pending: 35000,
        fee_status: "PENDING",
        payment_date: null,
        valid_until: "2026-05-31",
        updated_at: new Date().toISOString(),
      },
    ]
    for (const f of initialFees) {
      this.fees.set(f.student_id, f)
    }

    this.attendance = [
      {
        student_id: "3BR23CD016",
        name: "Deepak Kumar",
        bus_id: "BUS-01",
        route: "Route A (Cantonment to Main Campus)",
        driver: "Rajesh Kumar",
        plate_number: "KA-34-F-1102",
        stop: "Main Campus Gate",
        fee_status: "PAID",
        event_type: "BOARDED",
        status: "BOARDED",
        date: "2026-09-17",
        time: "08:15 AM",
        timestamp: new Date().toISOString(),
      },
      {
        student_id: "3BR23EC045",
        name: "Anita Sharma",
        bus_id: "BUS-03",
        route: "Route B (Gandhi Nagar - Siruguppa Rd)",
        driver: "Suresh Patel",
        plate_number: "KA-34-F-3341",
        stop: "City Centre Circle",
        fee_status: "PARTIAL",
        event_type: "BOARDED",
        status: "BOARDED",
        date: "2026-09-17",
        time: "08:22 AM",
        timestamp: new Date().toISOString(),
      },
    ]

    this.initialized = true
  }
}

const memoryFallback = new MemoryDataStore()

// Seed MongoDB if empty (duplicate-safe upsert)
async function ensureMongoSeeded(db: Db) {
  try {
    const userCount = await db.collection("users").countDocuments()
    if (userCount === 0) {
      await memoryFallback.seed()

      for (const u of memoryFallback.users.values()) {
        await db.collection("users").updateOne(
          { username: u.username },
          { $setOnInsert: u },
          { upsert: true }
        )
      }

      for (const s of memoryFallback.students.values()) {
        await db.collection("students").updateOne(
          { student_id: s.student_id },
          { $setOnInsert: s },
          { upsert: true }
        )
      }

      for (const d of memoryFallback.drivers.values()) {
        await db.collection("drivers").updateOne(
          { username: d.username },
          { $setOnInsert: d },
          { upsert: true }
        )
      }

      for (const b of memoryFallback.buses.values()) {
        await db.collection("buses").updateOne(
          { bus_id: b.bus_id },
          { $setOnInsert: b },
          { upsert: true }
        )
      }

      for (const f of memoryFallback.fees.values()) {
        await db.collection("fees").updateOne(
          { student_id: f.student_id },
          { $setOnInsert: f },
          { upsert: true }
        )
      }

      for (const a of memoryFallback.attendance) {
        await db.collection("attendance").insertOne(a)
      }
    }
  } catch (err) {
    // Non-fatal if seeding is interrupted
  }
}

// Check MongoDB availability and execute callback or fallback
export async function withMongo<T>(
  action: (db: Db) => Promise<T>,
  fallbackAction: (store: MemoryDataStore) => Promise<T> | T
): Promise<T> {
  await memoryFallback.seed()

  try {
    const client = await getMongoClientPromise()
    const db = client.db(DEFAULT_DB)
    await ensureMongoSeeded(db)
    return await action(db)
  } catch {
    // Return result from in-memory fallback store
    return await fallbackAction(memoryFallback)
  }
}

export { memoryFallback }
