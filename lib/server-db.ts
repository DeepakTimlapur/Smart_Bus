import crypto from "crypto"
import bcrypt from "bcryptjs"
import { withMongo, UserDoc, StudentDoc, DriverDoc, BusDoc, FeeDoc, AttendanceDoc, GpsLocationDoc, FaceReRegistrationRequestDoc } from "./mongodb"
import { sendStudentCredentialsEmail } from "./email"
import { reverseGeocode } from "./geocoding"
import { computeCosineSimilarity } from "./face-recognition"

export interface AuthUser {
  username: string
  name: string
  email: string
  role: "ADMIN" | "DRIVER" | "STUDENT"
  assigned_bus?: string | null
  student_id?: string | null
  department?: string | null
  phone?: string | null
}

export interface AttendanceResult {
  success: boolean
  action: "BOARDED" | "EXITED" | "DENIED"
  student_id: string
  name: string
  bus_id: string
  stop: string
  fee_status: string
  message: string
  timestamp: string
}

function getJwtSecret(): string {
  return process.env.JWT_SECRET || "smart-bus-secret-key-production-transit-os"
}

function getJwtExpireMinutes(): number {
  return parseInt(process.env.JWT_EXPIRE_MINUTES || "10080", 10)
}

// ---------------------------------------------------------------------------
// JWT Utility
// ---------------------------------------------------------------------------

export function createJwtToken(payload: Record<string, any>): string {
  const secret = getJwtSecret()
  const expireMinutes = getJwtExpireMinutes()
  const header = { alg: "HS256", typ: "JWT" }
  const exp = Math.floor(Date.now() / 1000) + expireMinutes * 60

  const fullPayload = { ...payload, exp }

  const encode = (obj: any) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")

  const encodedHeader = encode(header)
  const encodedPayload = encode(fullPayload)

  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")

  return `${encodedHeader}.${encodedPayload}.${signature}`
}

export function verifyJwtToken(token: string): Record<string, any> | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null

    const [headerB64, payloadB64, signatureB64] = parts
    const secret = getJwtSecret()

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")

    if (signatureB64 !== expectedSignature) return null

    const payloadJson = Buffer.from(payloadB64, "base64").toString("utf8")
    const payload = JSON.parse(payloadJson)

    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return null // Expired
    }

    return payload
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// MongoDB Persistence Service
// ---------------------------------------------------------------------------

export class MongoDatabaseService {
  // Authentication
  async findUserByUsername(username: string): Promise<UserDoc | null> {
    const cleanUser = username.trim()
    const lowerUser = cleanUser.toLowerCase()
    return await withMongo(
      async (db) => {
        return await db.collection<UserDoc>("users").findOne({
          $or: [
            { username: cleanUser },
            { username: lowerUser },
            { student_id: cleanUser },
            { student_id: cleanUser.toUpperCase() },
          ],
        })
      },
      (mem) => {
        const direct = mem.users.get(cleanUser) || mem.users.get(lowerUser)
        if (direct) return direct

        for (const u of mem.users.values()) {
          if (
            u.username.toLowerCase() === lowerUser ||
            (u.student_id && u.student_id.toLowerCase() === lowerUser)
          ) {
            return u
          }
        }
        return null
      }
    )
  }

  async verifyUserPassword(password: string, hash: string): Promise<boolean> {
    try {
      if (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$")) {
        return await bcrypt.compare(password, hash)
      }
      // Direct comparison fallback for legacy unhashed dev credentials
      return password === hash
    } catch {
      return false
    }
  }

  async changePassword(username: string, newPass: string): Promise<boolean> {
    const hash = await bcrypt.hash(newPass, 10)
    const now = new Date().toISOString()
    return await withMongo(
      async (db) => {
        const res = await db.collection("users").updateOne(
          { username },
          { $set: { password_hash: hash, updated_at: now } }
        )
        return res.matchedCount > 0
      },
      (mem) => {
        const u = mem.users.get(username)
        if (u) {
          u.password_hash = hash
          u.updated_at = now
          return true
        }
        return false
      }
    )
  }

  // Students Management
  async getStudents(): Promise<StudentDoc[]> {
    return await withMongo(
      async (db) => {
        return await db.collection<StudentDoc>("students").find({}).toArray()
      },
      (mem) => Array.from(mem.students.values())
    )
  }

  async getStudentById(student_id: string): Promise<StudentDoc | null> {
    return await withMongo(
      async (db) => {
        return await db.collection<StudentDoc>("students").findOne({ student_id })
      },
      (mem) => mem.students.get(student_id) || null
    )
  }

  async createStudentWithAccount(studentData: {
    student_id: string
    name: string
    email: string
    phone: string
    department: string
    year: string
    semester: string
    bus_id: string
    pickup_location: string
    fee_total?: number
    fee_paid?: number
    fee_valid_until?: string
    password?: string
  }): Promise<{ student: StudentDoc; emailResult: { sent: boolean; error?: string } }> {
    const cleanId = studentData.student_id.trim()
    const cleanEmail = studentData.email.trim().toLowerCase()
    const now = new Date().toISOString()

    // Use provided password or generate secure 10-char alphanumeric temporary password
    const plainPassword = studentData.password?.trim() || crypto.randomBytes(4).toString("hex") + "A1!"
    const password_hash = await bcrypt.hash(plainPassword, 10)

    const fee_total = Number(studentData.fee_total || 35000)
    const fee_paid = Number(studentData.fee_paid || 0)
    const fee_pending = Math.max(0, fee_total - fee_paid)
    const fee_status = fee_pending === 0 ? "PAID" : fee_paid > 0 ? "PARTIAL" : "PENDING"
    const fee_valid_until = studentData.fee_valid_until || "2027-05-31"

    const newStudent: StudentDoc = {
      student_id: cleanId,
      name: studentData.name.trim(),
      email: cleanEmail,
      phone: studentData.phone.trim(),
      department: studentData.department.trim(),
      year: studentData.year.trim(),
      semester: studentData.semester.trim(),
      bus_id: studentData.bus_id.trim(),
      pickup_location: studentData.pickup_location.trim(),
      fee_total,
      fee_paid,
      fee_pending,
      fee_status,
      fee_valid_until,
      account_status: "ACTIVE",
      is_boarded: false,
      face_registered: false,
      face_reregistration_status: "NONE",
      created_at: now,
      updated_at: now,
    }

    const newUser: UserDoc = {
      username: cleanId,
      name: newStudent.name,
      email: cleanEmail,
      password_hash,
      role: "STUDENT",
      student_id: cleanId,
      assigned_bus: newStudent.bus_id,
      department: newStudent.department,
      phone: newStudent.phone,
      account_status: "ACTIVE",
      created_at: now,
      updated_at: now,
    }

    const newFee: FeeDoc = {
      student_id: cleanId,
      student_name: newStudent.name,
      email: cleanEmail,
      bus_id: newStudent.bus_id,
      academic_year: "2026-2027",
      fee_total,
      fee_paid,
      fee_pending,
      fee_status,
      payment_date: fee_paid > 0 ? now.split("T")[0] : null,
      valid_until: fee_valid_until,
      updated_at: now,
    }

    await withMongo(
      async (db) => {
        await db.collection("students").updateOne({ student_id: cleanId }, { $set: newStudent }, { upsert: true })
        await db.collection("users").updateOne({ username: cleanId }, { $set: newUser }, { upsert: true })
        await db.collection("fees").updateOne({ student_id: cleanId }, { $set: newFee }, { upsert: true })
      },
      (mem) => {
        mem.students.set(cleanId, newStudent)
        mem.users.set(cleanId, newUser)
        mem.fees.set(cleanId, newFee)
      }
    )

    // Dispatch credentials via SMTP immediately without logging the password
    const emailResult = await sendStudentCredentialsEmail(newStudent.name, cleanId, cleanEmail, plainPassword)

    return {
      student: newStudent,
      emailResult,
    }
  }

  async updateStudent(student_id: string, updates: Partial<StudentDoc>): Promise<StudentDoc | null> {
    const now = new Date().toISOString()
    return await withMongo(
      async (db) => {
        const setDoc: any = { ...updates, updated_at: now }
        delete setDoc._id
        delete setDoc.student_id

        if (setDoc.fee_total !== undefined || setDoc.fee_paid !== undefined) {
          const existing = await db.collection<StudentDoc>("students").findOne({ student_id })
          if (existing) {
            const tot = setDoc.fee_total !== undefined ? Number(setDoc.fee_total) : existing.fee_total
            const pd = setDoc.fee_paid !== undefined ? Number(setDoc.fee_paid) : existing.fee_paid
            setDoc.fee_pending = Math.max(0, tot - pd)
            setDoc.fee_status = setDoc.fee_pending === 0 ? "PAID" : pd > 0 ? "PARTIAL" : "PENDING"
          }
        }

        const res = await db.collection<StudentDoc>("students").findOneAndUpdate(
          { student_id },
          { $set: setDoc },
          { returnDocument: "after" }
        )

        // Also sync fees collection
        if (setDoc.fee_total !== undefined || setDoc.fee_paid !== undefined || setDoc.bus_id || setDoc.name) {
          await db.collection("fees").updateOne(
            { student_id },
            {
              $set: {
                ...(setDoc.name && { student_name: setDoc.name }),
                ...(setDoc.bus_id && { bus_id: setDoc.bus_id }),
                ...(setDoc.fee_total !== undefined && { fee_total: setDoc.fee_total }),
                ...(setDoc.fee_paid !== undefined && { fee_paid: setDoc.fee_paid }),
                ...(setDoc.fee_pending !== undefined && { fee_pending: setDoc.fee_pending }),
                ...(setDoc.fee_status && { fee_status: setDoc.fee_status }),
                updated_at: now,
              },
            }
          )
        }

        return res || null
      },
      (mem) => {
        const s = mem.students.get(student_id)
        if (!s) return null
        Object.assign(s, updates, { updated_at: now })
        if (updates.fee_total !== undefined || updates.fee_paid !== undefined) {
          s.fee_pending = Math.max(0, s.fee_total - s.fee_paid)
          s.fee_status = s.fee_pending === 0 ? "PAID" : s.fee_paid > 0 ? "PARTIAL" : "PENDING"
        }
        const f = mem.fees.get(student_id)
        if (f) {
          if (s.name) f.student_name = s.name
          if (s.bus_id) f.bus_id = s.bus_id
          f.fee_total = s.fee_total
          f.fee_paid = s.fee_paid
          f.fee_pending = s.fee_pending
          f.fee_status = s.fee_status
          f.updated_at = now
        }
        return s
      }
    )
  }

  async deleteStudent(student_id: string): Promise<boolean> {
    return await withMongo(
      async (db) => {
        await db.collection("students").deleteOne({ student_id })
        await db.collection("users").deleteOne({ student_id })
        await db.collection("fees").deleteOne({ student_id })
        return true
      },
      (mem) => {
        mem.students.delete(student_id)
        mem.users.delete(student_id)
        mem.fees.delete(student_id)
        return true
      }
    )
  }

  // Drivers Management
  async getDrivers(): Promise<DriverDoc[]> {
    return await withMongo(
      async (db) => {
        return await db.collection<DriverDoc>("drivers").find({}).toArray()
      },
      (mem) => Array.from(mem.drivers.values())
    )
  }

  async createDriver(driverData: {
    username: string
    name: string
    email: string
    phone: string
    license_number: string
    assigned_bus?: string | null
  }): Promise<DriverDoc> {
    const cleanUser = driverData.username.trim()
    const now = new Date().toISOString()
    const password_hash = await bcrypt.hash("driver123", 10)

    const newDriver: DriverDoc = {
      username: cleanUser,
      name: driverData.name.trim(),
      email: driverData.email.trim(),
      phone: driverData.phone.trim(),
      license_number: driverData.license_number.trim(),
      assigned_bus: driverData.assigned_bus || null,
      account_status: "ACTIVE",
      created_at: now,
      updated_at: now,
    }

    const newUser: UserDoc = {
      username: cleanUser,
      name: newDriver.name,
      email: newDriver.email,
      password_hash,
      role: "DRIVER",
      assigned_bus: newDriver.assigned_bus,
      phone: newDriver.phone,
      account_status: "ACTIVE",
      created_at: now,
      updated_at: now,
    }

    await withMongo(
      async (db) => {
        await db.collection("drivers").updateOne({ username: cleanUser }, { $set: newDriver }, { upsert: true })
        await db.collection("users").updateOne({ username: cleanUser }, { $set: newUser }, { upsert: true })
      },
      (mem) => {
        mem.drivers.set(cleanUser, newDriver)
        mem.users.set(cleanUser, newUser)
      }
    )

    return newDriver
  }

  async updateDriver(username: string, updates: Partial<DriverDoc>): Promise<DriverDoc | null> {
    const cleanUser = username.trim()
    const now = new Date().toISOString()
    return await withMongo(
      async (db) => {
        const setDoc: any = { ...updates, updated_at: now }
        delete setDoc._id
        delete setDoc.username
        const updated = await db.collection<DriverDoc>("drivers").findOneAndUpdate(
          { username: cleanUser },
          { $set: setDoc },
          { returnDocument: "after" }
        )
        if (updates.name || updates.email || updates.assigned_bus || updates.phone) {
          await db.collection("users").updateOne(
            { username: cleanUser },
            {
              $set: {
                ...(updates.name && { name: updates.name }),
                ...(updates.email && { email: updates.email }),
                ...(updates.phone && { phone: updates.phone }),
                ...(updates.assigned_bus !== undefined && { assigned_bus: updates.assigned_bus }),
                updated_at: now,
              },
            }
          )
        }
        return updated
      },
      (mem) => {
        const d = mem.drivers.get(cleanUser)
        if (!d) return null
        Object.assign(d, updates, { updated_at: now })
        const u = mem.users.get(cleanUser)
        if (u) {
          if (updates.name) u.name = updates.name
          if (updates.email) u.email = updates.email
          if (updates.phone) u.phone = updates.phone
          if (updates.assigned_bus !== undefined) u.assigned_bus = updates.assigned_bus
          u.updated_at = now
        }
        return d
      }
    )
  }

  async deleteDriver(username: string): Promise<boolean> {
    const cleanUser = username.trim()
    return await withMongo(
      async (db) => {
        await db.collection("drivers").deleteOne({ username: cleanUser })
        await db.collection("users").deleteOne({ username: cleanUser })
        return true
      },
      (mem) => {
        mem.drivers.delete(cleanUser)
        mem.users.delete(cleanUser)
        return true
      }
    )
  }

  // Buses Management
  async getBuses(): Promise<BusDoc[]> {
    return await withMongo(
      async (db) => {
        return await db.collection<BusDoc>("buses").find({}).toArray()
      },
      (mem) => Array.from(mem.buses.values())
    )
  }

  async getBusById(bus_id: string): Promise<BusDoc | null> {
    return await withMongo(
      async (db) => {
        return await db.collection<BusDoc>("buses").findOne({ bus_id })
      },
      (mem) => mem.buses.get(bus_id) || null
    )
  }

  async createBus(busData: {
    bus_id: string
    bus_number?: string
    bus_name?: string
    registration_number: string
    route: string
    capacity: number
    stops?: string[]
    driver_id?: string | null
    driver_name?: string | null
  }): Promise<BusDoc> {
    const cleanId = busData.bus_id.trim()
    const now = new Date().toISOString()

    const newBus: BusDoc = {
      bus_id: cleanId,
      bus_number: busData.bus_number || cleanId,
      bus_name: busData.bus_name || `${cleanId} (${busData.route})`,
      registration_number: busData.registration_number.trim(),
      plate_number: busData.registration_number.trim(),
      route: busData.route.trim(),
      stops: busData.stops && busData.stops.length > 0 ? busData.stops : ["Main Campus Gate", "City Circle", "Terminal"],
      capacity: Number(busData.capacity || 40),
      passengers: 0,
      driver_id: busData.driver_id || null,
      driver_name: busData.driver_name || "Unassigned",
      status: "ACTIVE",
      latitude: 15.1394,
      longitude: 76.9214,
      speed: 0,
      heading: 0,
      area: "Central Transit Station",
      city: "Ballari",
      state: "Karnataka",
      country: "India",
      last_gps_time: now,
      created_at: now,
      updated_at: now,
    }

    await withMongo(
      async (db) => {
        await db.collection("buses").updateOne({ bus_id: cleanId }, { $set: newBus }, { upsert: true })
      },
      (mem) => {
        mem.buses.set(cleanId, newBus)
      }
    )

    return newBus
  }

  async updateBus(bus_id: string, updates: Partial<BusDoc>): Promise<BusDoc | null> {
    const now = new Date().toISOString()
    return await withMongo(
      async (db) => {
        const setDoc: any = { ...updates, updated_at: now }
        delete setDoc._id
        delete setDoc.bus_id
        return await db.collection<BusDoc>("buses").findOneAndUpdate(
          { bus_id },
          { $set: setDoc },
          { returnDocument: "after" }
        )
      },
      (mem) => {
        const b = mem.buses.get(bus_id)
        if (!b) return null
        Object.assign(b, updates, { updated_at: now })
        return b
      }
    )
  }

  async deleteBus(bus_id: string): Promise<boolean> {
    return await withMongo(
      async (db) => {
        await db.collection("buses").deleteOne({ bus_id })
        return true
      },
      (mem) => {
        mem.buses.delete(bus_id)
        return true
      }
    )
  }

  async assignDriverToBus(bus_id: string, driver_id: string, driver_name: string): Promise<BusDoc | null> {
    const now = new Date().toISOString()
    return await withMongo(
      async (db) => {
        await db.collection("drivers").updateOne(
          { username: driver_id },
          { $set: { assigned_bus: bus_id, updated_at: now } }
        )
        await db.collection("users").updateOne(
          { username: driver_id },
          { $set: { assigned_bus: bus_id, updated_at: now } }
        )
        return await db.collection<BusDoc>("buses").findOneAndUpdate(
          { bus_id },
          { $set: { driver_id, driver_name, updated_at: now } },
          { returnDocument: "after" }
        )
      },
      (mem) => {
        const b = mem.buses.get(bus_id)
        if (b) {
          b.driver_id = driver_id
          b.driver_name = driver_name
          b.updated_at = now
        }
        const d = mem.drivers.get(driver_id)
        if (d) {
          d.assigned_bus = bus_id
          d.updated_at = now
        }
        const u = mem.users.get(driver_id)
        if (u) {
          u.assigned_bus = bus_id
          u.updated_at = now
        }
        return b || null
      }
    )
  }

  // Live GPS Telemetry
  async updateGpsLocation(telemetry: {
    bus_id: string
    latitude: number
    longitude: number
    speed?: number
    heading?: number
    route?: string
    driver_id?: string
    area?: string
    city?: string
  }): Promise<{ success: boolean; message: string; timestamp: string }> {
    const now = new Date().toISOString()
    const bus_id = telemetry.bus_id
    const speed = Number(telemetry.speed || 0)
    const heading = Number(telemetry.heading || 0)

    let area = telemetry.area
    let city = telemetry.city
    let state = "Karnataka"
    let country = "India"

    if (!area || !city) {
      try {
        const geo = await reverseGeocode(telemetry.latitude, telemetry.longitude)
        if (!area && geo.area) area = geo.area
        if (!city && geo.city) city = geo.city
        if (geo.state) state = geo.state
        if (geo.country) country = geo.country
      } catch {
        // Fallback safely
      }
    }

    area = area || "Transit Corridor"
    city = city || "Ballari"

    const locationRecord: GpsLocationDoc = {
      busId: bus_id,
      bus_id: bus_id,
      latitude: telemetry.latitude,
      longitude: telemetry.longitude,
      speed,
      heading,
      route: telemetry.route || "",
      driverId: telemetry.driver_id || null,
      driver_id: telemetry.driver_id || null,
      area,
      city,
      state,
      country,
      timestamp: now,
    }

    await withMongo(
      async (db) => {
        await db.collection("buses").updateOne(
          { bus_id },
          {
            $set: {
              latitude: telemetry.latitude,
              longitude: telemetry.longitude,
              speed,
              heading,
              area,
              city,
              status: speed > 2 ? "IN_TRANSIT" : "ACTIVE",
              last_gps_time: now,
              updated_at: now,
            },
          }
        )
        await db.collection("gps_locations").insertOne(locationRecord)
      },
      (mem) => {
        const b = mem.buses.get(bus_id)
        if (b) {
          b.latitude = telemetry.latitude
          b.longitude = telemetry.longitude
          b.speed = speed
          b.heading = heading
          b.area = area
          b.city = city
          b.status = speed > 2 ? "IN_TRANSIT" : "ACTIVE"
          b.last_gps_time = now
          b.updated_at = now
        }
        mem.gpsLocations.push(locationRecord)
      }
    )

    return {
      success: true,
      message: "GPS location updated successfully in MongoDB.",
      timestamp: now,
    }
  }

  // Fees Management
  async getFees(): Promise<FeeDoc[]> {
    return await withMongo(
      async (db) => {
        return await db.collection<FeeDoc>("fees").find({}).toArray()
      },
      (mem) => Array.from(mem.fees.values())
    )
  }

  async getFeeForStudent(student_id: string): Promise<FeeDoc | null> {
    return await withMongo(
      async (db) => {
        return await db.collection<FeeDoc>("fees").findOne({ student_id })
      },
      (mem) => mem.fees.get(student_id) || null
    )
  }

  async updateFee(
    student_id: string,
    updates: {
      fee_total?: number
      fee_paid?: number
      payment_date?: string | null
      valid_until?: string | null
    }
  ): Promise<FeeDoc | null> {
    const now = new Date().toISOString()
    return await withMongo(
      async (db) => {
        const existing = await db.collection<FeeDoc>("fees").findOne({ student_id })
        if (!existing) return null

        const tot = updates.fee_total !== undefined ? Number(updates.fee_total) : existing.fee_total
        const pd = updates.fee_paid !== undefined ? Number(updates.fee_paid) : existing.fee_paid
        const fee_pending = Math.max(0, tot - pd)
        const fee_status = fee_pending === 0 ? "PAID" : pd > 0 ? "PARTIAL" : "PENDING"

        const setDoc: any = {
          fee_total: tot,
          fee_paid: pd,
          fee_pending,
          fee_status,
          updated_at: now,
        }
        if (updates.payment_date !== undefined) setDoc.payment_date = updates.payment_date
        if (updates.valid_until !== undefined) setDoc.valid_until = updates.valid_until

        const res = await db.collection<FeeDoc>("fees").findOneAndUpdate(
          { student_id },
          { $set: setDoc },
          { returnDocument: "after" }
        )

        // Sync with student record
        await db.collection("students").updateOne(
          { student_id },
          {
            $set: {
              fee_total: tot,
              fee_paid: pd,
              fee_pending,
              fee_status,
              ...(updates.valid_until && { fee_valid_until: updates.valid_until }),
              updated_at: now,
            },
          }
        )

        return res || null
      },
      (mem) => {
        const f = mem.fees.get(student_id)
        if (!f) return null
        if (updates.fee_total !== undefined) f.fee_total = Number(updates.fee_total)
        if (updates.fee_paid !== undefined) f.fee_paid = Number(updates.fee_paid)
        f.fee_pending = Math.max(0, f.fee_total - f.fee_paid)
        f.fee_status = f.fee_pending === 0 ? "PAID" : f.fee_paid > 0 ? "PARTIAL" : "PENDING"
        if (updates.payment_date !== undefined) f.payment_date = updates.payment_date
        if (updates.valid_until !== undefined) f.valid_until = updates.valid_until
        f.updated_at = now

        const s = mem.students.get(student_id)
        if (s) {
          s.fee_total = f.fee_total
          s.fee_paid = f.fee_paid
          s.fee_pending = f.fee_pending
          s.fee_status = f.fee_status
          if (updates.valid_until) s.fee_valid_until = updates.valid_until
          s.updated_at = now
        }
        return f
      }
    )
  }

  async createOrUpdateFee(
    student_id: string,
    data: {
      fee_total: number
      fee_paid?: number
      academic_year?: string
      payment_date?: string | null
      valid_until?: string | null
    }
  ): Promise<FeeDoc> {
    const cleanId = student_id.trim()
    const now = new Date().toISOString()
    const tot = Number(data.fee_total || 0)
    const pd = Number(data.fee_paid || 0)
    const fee_pending = Math.max(0, tot - pd)
    const fee_status = fee_pending === 0 ? "PAID" : pd > 0 ? "PARTIAL" : "PENDING"
    const academic_year = data.academic_year || "2026-27"
    const valid_until = data.valid_until || "2027-05-31"
    const payment_date = data.payment_date || now.split("T")[0]

    const student = await this.getStudentById(cleanId)

    const feeDoc: FeeDoc = {
      student_id: cleanId,
      student_name: student?.name || cleanId,
      email: student?.email || "",
      bus_id: student?.bus_id || "BUS-01",
      fee_total: tot,
      fee_paid: pd,
      fee_pending,
      fee_status,
      academic_year,
      valid_until,
      payment_date,
      updated_at: now,
    }

    await withMongo(
      async (db) => {
        await db.collection<FeeDoc>("fees").updateOne(
          { student_id: cleanId },
          { $set: feeDoc },
          { upsert: true }
        )
        await db.collection("students").updateOne(
          { student_id: cleanId },
          {
            $set: {
              fee_total: tot,
              fee_paid: pd,
              fee_pending,
              fee_status,
              fee_valid_until: valid_until,
              updated_at: now,
            },
          }
        )
      },
      (mem) => {
        mem.fees.set(cleanId, feeDoc)
        const s = mem.students.get(cleanId)
        if (s) {
          s.fee_total = tot
          s.fee_paid = pd
          s.fee_pending = fee_pending
          s.fee_status = fee_status
          s.fee_valid_until = valid_until
          s.updated_at = now
        }
      }
    )
    return feeDoc
  }

  // Attendance / Bus Entry Verification (Non-QR: camera / face-recognition / RFID / manual)
  async recordAttendanceEvent(params: {
    student_id: string
    bus_id: string
    stop?: string
    event_type?: "BOARDED" | "EXITED" | "DENIED" | "AUTO"
  }): Promise<AttendanceResult> {
    const student_id = params.student_id.trim()
    const bus_id = params.bus_id.trim()
    const stop = params.stop || "Campus Terminal"
    const now = new Date()
    const timestamp = now.toISOString()
    const dateStr = now.toISOString().split("T")[0]
    const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })

    const student = await this.getStudentById(student_id)
    const bus = await this.getBusById(bus_id)

    if (!student) {
      const deniedDoc: AttendanceDoc = {
        student_id,
        name: "Unknown Student",
        bus_id,
        route: bus?.route || "Unknown Route",
        driver: bus?.driver_name || "Unassigned",
        plate_number: bus?.plate_number || bus_id,
        stop,
        fee_status: "UNREGISTERED",
        event_type: "DENIED",
        status: "DENIED",
        date: dateStr,
        time: timeStr,
        timestamp,
      }
      await withMongo(
        async (db) => {
          await db.collection("attendance").insertOne(deniedDoc)
        },
        (mem) => {
          mem.attendance.unshift(deniedDoc)
        }
      )
      return {
        success: false,
        action: "DENIED",
        student_id,
        name: "Unknown Student",
        bus_id,
        stop,
        fee_status: "UNREGISTERED",
        message: `Denied: Student ID '${student_id}' not found in registry.`,
        timestamp,
      }
    }

    // Fee validity check
    const fee = await this.getFeeForStudent(student_id)
    const isFeePending = student.fee_status === "PENDING" || (fee && fee.fee_status === "PENDING")
    const validUntilStr = fee?.valid_until || student.fee_valid_until
    const isExpired = validUntilStr ? new Date(validUntilStr).getTime() < new Date(dateStr).getTime() : false

    if (isFeePending || isExpired) {
      const reason = isExpired ? "Pass Expired" : "Fee Payment Pending"
      const deniedDoc: AttendanceDoc = {
        student_id: student.student_id,
        name: student.name,
        bus_id,
        route: bus?.route || student.bus_id,
        driver: bus?.driver_name || "Unassigned",
        plate_number: bus?.plate_number || bus_id,
        stop,
        fee_status: student.fee_status,
        event_type: "DENIED",
        status: "DENIED",
        date: dateStr,
        time: timeStr,
        timestamp,
      }
      await withMongo(
        async (db) => {
          await db.collection("attendance").insertOne(deniedDoc)
        },
        (mem) => {
          mem.attendance.unshift(deniedDoc)
        }
      )
      return {
        success: false,
        action: "DENIED",
        student_id: student.student_id,
        name: student.name,
        bus_id,
        stop,
        fee_status: student.fee_status,
        message: `Denied: ${reason}. Please clear transport dues with the transit office.`,
        timestamp,
      }
    }

    // Handle explicit DENIED event
    if (params.event_type === "DENIED") {
      const deniedDoc: AttendanceDoc = {
        student_id: student.student_id,
        name: student.name,
        bus_id,
        route: bus?.route || student.bus_id,
        driver: bus?.driver_name || "Unassigned",
        plate_number: bus?.plate_number || bus_id,
        stop,
        fee_status: student.fee_status,
        event_type: "DENIED",
        status: "DENIED",
        date: dateStr,
        time: timeStr,
        timestamp,
      }
      await withMongo(
        async (db) => {
          await db.collection("attendance").insertOne(deniedDoc)
        },
        (mem) => {
          mem.attendance.unshift(deniedDoc)
        }
      )
      return {
        success: false,
        action: "DENIED",
        student_id: student.student_id,
        name: student.name,
        bus_id,
        stop,
        fee_status: student.fee_status,
        message: "Transit entry denied by terminal.",
        timestamp,
      }
    }

    // Determine entry vs exit
    let determinedAction: "BOARDED" | "EXITED" = "BOARDED"
    if (params.event_type === "EXITED") {
      determinedAction = "EXITED"
    } else if (params.event_type === "BOARDED") {
      determinedAction = "BOARDED"
    } else {
      determinedAction = student.is_boarded ? "EXITED" : "BOARDED"
    }

    const eventDoc: AttendanceDoc = {
      student_id: student.student_id,
      name: student.name,
      bus_id,
      route: bus?.route || student.bus_id,
      driver: bus?.driver_name || "Unassigned",
      plate_number: bus?.plate_number || bus_id,
      stop,
      fee_status: student.fee_status,
      event_type: determinedAction,
      status: determinedAction,
      date: dateStr,
      time: timeStr,
      timestamp,
    }

    const isBoardedNow = determinedAction === "BOARDED"

    await withMongo(
      async (db) => {
        await db.collection("attendance").insertOne(eventDoc)
        await db.collection("students").updateOne(
          { student_id: student.student_id },
          { $set: { is_boarded: isBoardedNow, updated_at: timestamp } }
        )
        if (bus) {
          const newPax = isBoardedNow
            ? Math.min(bus.capacity, bus.passengers + 1)
            : Math.max(0, bus.passengers - 1)
          await db.collection("buses").updateOne(
            { bus_id },
            { $set: { passengers: newPax, updated_at: timestamp } }
          )
        }
      },
      (mem) => {
        mem.attendance.unshift(eventDoc)
        const st = mem.students.get(student.student_id)
        if (st) st.is_boarded = isBoardedNow
        const b = mem.buses.get(bus_id)
        if (b) {
          b.passengers = isBoardedNow
            ? Math.min(b.capacity, b.passengers + 1)
            : Math.max(0, b.passengers - 1)
        }
      }
    )

    return {
      success: true,
      action: determinedAction,
      student_id: student.student_id,
      name: student.name,
      bus_id,
      stop,
      fee_status: student.fee_status,
      message:
        determinedAction === "BOARDED"
          ? `Verified entry: Boarded successfully at ${stop}`
          : `Verified exit: Exited bus at ${stop}`,
      timestamp,
    }
  }

  async getAttendance(bus_id?: string): Promise<AttendanceDoc[]> {
    return await withMongo(
      async (db) => {
        const query = bus_id ? { bus_id } : {}
        return await db.collection<AttendanceDoc>("attendance").find(query).sort({ timestamp: -1 }).limit(100).toArray()
      },
      (mem) => {
        if (bus_id) return mem.attendance.filter((a) => a.bus_id === bus_id)
        return mem.attendance
      }
    )
  }

  // Dashboard Aggregation
  async getDashboardData(user: AuthUser) {
    const buses = await this.getBuses()
    const students = await this.getStudents()
    const attendance = await this.getAttendance()
    const fees = await this.getFees()
    const drivers = await this.getDrivers()

    if (user.role === "STUDENT") {
      const myStudent = students.find((s) => s.student_id === user.student_id || s.student_id === user.username)
      const myBus = buses.find((b) => b.bus_id === (myStudent?.bus_id || user.assigned_bus))
      const myFee = fees.find((f) => f.student_id === (myStudent?.student_id || user.student_id))
      const myAttendance = attendance.filter((a) => a.student_id === (myStudent?.student_id || user.student_id))
      const myDriver = myBus?.driver_id ? drivers.find((d) => d.username === myBus.driver_id) : null

      return {
        role: "STUDENT",
        student: myStudent || {
          student_id: user.student_id || user.username,
          name: user.name,
          email: user.email,
          bus_id: user.assigned_bus || "BUS-01",
          department: user.department || "Engineering",
        },
        assigned_bus: myBus || null,
        driver: myDriver || { name: myBus?.driver_name || "Unassigned", phone: "+91 98888 11111" },
        fee: myFee || {
          fee_total: 35000,
          fee_paid: 35000,
          fee_pending: 0,
          fee_status: "PAID",
          valid_until: "2027-05-31",
        },
        live_location: myBus
          ? {
              bus_id: myBus.bus_id,
              latitude: myBus.latitude,
              longitude: myBus.longitude,
              speed: myBus.speed,
              area: myBus.area,
              city: myBus.city,
              last_updated: myBus.last_gps_time,
            }
          : null,
        recent_attendance: myAttendance.slice(0, 10),
      }
    }

    if (user.role === "DRIVER") {
      const assignedBusId = user.assigned_bus || "BUS-01"
      const myBus = buses.find((b) => b.bus_id === assignedBusId) || buses[0]
      const busAttendance = attendance.filter((a) => a.bus_id === myBus?.bus_id)
      const busStudents = students.filter((s) => s.bus_id === myBus?.bus_id)

      return {
        role: "DRIVER",
        driver: {
          username: user.username,
          name: user.name,
          email: user.email,
        },
        assigned_bus: myBus,
        passengers_count: myBus?.passengers || 0,
        available_seats: Math.max(0, (myBus?.capacity || 40) - (myBus?.passengers || 0)),
        capacity: myBus?.capacity || 40,
        route: myBus?.route,
        gps: {
          latitude: myBus?.latitude,
          longitude: myBus?.longitude,
          speed: myBus?.speed,
          heading: myBus?.heading,
          area: myBus?.area,
          city: myBus?.city,
          last_updated: myBus?.last_gps_time,
        },
        assigned_students: busStudents,
        recent_attendance: busAttendance.slice(0, 15),
      }
    }

    // ADMIN Dashboard
    const totalStudents = students.length
    const totalDrivers = drivers.length
    const totalBuses = buses.length
    const totalPassengers = buses.reduce((acc, b) => acc + (b.passengers || 0), 0)
    const totalCapacity = buses.reduce((acc, b) => acc + (b.capacity || 0), 0)

    const paidStudents = students.filter((s) => s.fee_status === "PAID").length
    const partialStudents = students.filter((s) => s.fee_status === "PARTIAL").length
    const pendingStudents = students.filter((s) => s.fee_status === "PENDING").length
    const totalRevenue = fees.reduce((acc, f) => acc + (f.fee_paid || 0), 0)
    const pendingRevenue = fees.reduce((acc, f) => acc + (f.fee_pending || 0), 0)

    return {
      role: "ADMIN",
      summary: {
        total_students: totalStudents,
        total_drivers: totalDrivers,
        total_buses: totalBuses,
        active_passengers: totalPassengers,
        total_capacity: totalCapacity,
        occupancy_rate: totalCapacity > 0 ? `${Math.round((totalPassengers / totalCapacity) * 100)}%` : "0%",
        paid_students: paidStudents,
        partial_students: partialStudents,
        pending_students: pendingStudents,
        total_revenue: `₹${totalRevenue.toLocaleString()}`,
        pending_revenue: `₹${pendingRevenue.toLocaleString()}`,
      },
      live_buses: buses.map((b) => ({
        bus_id: b.bus_id,
        bus_name: b.bus_name,
        route: b.route,
        passengers: b.passengers,
        capacity: b.capacity,
        status: b.status,
        speed: b.speed,
        latitude: b.latitude,
        longitude: b.longitude,
        area: b.area,
        city: b.city,
        driver_name: b.driver_name,
        last_updated: b.last_gps_time,
      })),
      recent_attendance: attendance.slice(0, 20),
    }
  }

  // -------------------------------------------------------------------------
  // Face Recognition & Management Methods
  // -------------------------------------------------------------------------

  async getFaceStatus(student_id: string): Promise<{
    student_id: string
    name: string
    face_registered: boolean
    face_registered_at: string | null
    face_sample_count: number
    face_reregistration_status: string
    face_reregistration_requested: boolean
    fee_status: string
    assigned_bus: string
  } | null> {
    const student = await this.getStudentById(student_id)
    if (!student) return null

    return {
      student_id: student.student_id,
      name: student.name,
      face_registered: Boolean(student.face_registered),
      face_registered_at: student.face_registered_at || null,
      face_sample_count: student.face_sample_count || (student.face_registered ? 5 : 0),
      face_reregistration_status: student.face_reregistration_status || "NONE",
      face_reregistration_requested: Boolean(student.face_reregistration_requested),
      fee_status: student.fee_status,
      assigned_bus: student.bus_id,
    }
  }

  async registerFace(
    student_id: string,
    embedding: number[],
    sample_count = 5
  ): Promise<{ success: boolean; message: string; error?: string; registered_at?: string }> {
    const student = await this.getStudentById(student_id)
    if (!student) {
      return { success: false, message: "Student not found in registry.", error: "Student not found in registry." }
    }

    if (!Array.isArray(embedding) || embedding.length !== 128) {
      return { success: false, message: "Invalid face embedding: 128-dimensional vector required.", error: "Invalid face embedding: 128-dimensional vector required." }
    }

    // Single active face registration enforcement:
    // If student already has a registered face and hasn't been approved for re-registration:
    if (student.face_registered && student.face_reregistration_status !== "APPROVED") {
      return {
        success: false,
        message: "Face already registered. To register a new face, contact the administrator.",
        error: "Face already registered. To register a new face, contact the administrator.",
      }
    }

    const now = new Date().toISOString()

    await withMongo(
      async (db) => {
        await db.collection("students").updateOne(
          { student_id },
          {
            $set: {
              face_registered: true,
              face_embedding: embedding,
              face_registered_at: now,
              face_sample_count: sample_count,
              face_reregistration_status: "NONE",
              face_reregistration_requested: false,
              updated_at: now,
            },
          }
        )
        // Mark any pending request as completed
        await db.collection("face_requests").updateOne(
          { student_id, status: "APPROVED" },
          { $set: { status: "COMPLETED", reviewed_at: now } }
        )
      },
      (mem) => {
        const s = mem.students.get(student_id)
        if (s) {
          s.face_registered = true
          s.face_embedding = embedding
          s.face_registered_at = now
          s.face_sample_count = sample_count
          s.face_reregistration_status = "NONE"
          s.face_reregistration_requested = false
          s.updated_at = now
        }
        for (const req of mem.faceRequests.values()) {
          if (req.student_id === student_id && req.status === "APPROVED") {
            req.status = "COMPLETED" as any
            req.reviewed_at = now
          }
        }
      }
    )

    return {
      success: true,
      message: "Face registration completed successfully.",
      registered_at: now,
    }
  }

  async requestFaceReRegistration(
    student_id: string,
    reason?: string
  ): Promise<{ success: boolean; message: string; status: string; error?: string }> {
    const student = await this.getStudentById(student_id)
    if (!student) {
      return { success: false, message: "Student not found in registry.", error: "Student not found in registry.", status: "NONE" }
    }

    if (!student.face_registered) {
      return {
        success: false,
        message: "Face is not currently registered. Please complete initial registration first.",
        error: "Face is not currently registered. Please complete initial registration first.",
        status: "NONE",
      }
    }

    if (student.face_reregistration_status === "PENDING") {
      return {
        success: true,
        message: "Re-registration request already pending administrator review.",
        status: "PENDING",
      }
    }

    const now = new Date().toISOString()
    const requestId = `REQ-${Date.now()}`

    const requestDoc: FaceReRegistrationRequestDoc = {
      request_id: requestId,
      student_id,
      student_name: student.name,
      department: student.department,
      bus_id: student.bus_id,
      requested_at: now,
      status: "PENDING",
      admin_notes: reason || "Student requested face update",
    }

    await withMongo(
      async (db) => {
        await db.collection("face_requests").insertOne(requestDoc)
        await db.collection("students").updateOne(
          { student_id },
          {
            $set: {
              face_reregistration_requested: true,
              face_reregistration_status: "PENDING",
              face_reregistration_request_date: now,
              updated_at: now,
            },
          }
        )
      },
      (mem) => {
        mem.faceRequests.set(requestId, requestDoc)
        const s = mem.students.get(student_id)
        if (s) {
          s.face_reregistration_requested = true
          s.face_reregistration_status = "PENDING"
          s.face_reregistration_request_date = now
          s.updated_at = now
        }
      }
    )

    return {
      success: true,
      message: "Face re-registration request submitted. Awaiting administrator approval.",
      status: "PENDING",
    }
  }

  async getFaceReRegistrationRequests(): Promise<FaceReRegistrationRequestDoc[]> {
    return await withMongo(
      async (db) => {
        return await db
          .collection<FaceReRegistrationRequestDoc>("face_requests")
          .find({})
          .sort({ requested_at: -1 })
          .toArray()
      },
      (mem) => {
        return Array.from(mem.faceRequests.values()).sort(
          (a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime()
        )
      }
    )
  }

  async approveFaceReRegistration(
    student_id: string,
    action: "APPROVE" | "REJECT",
    admin_notes?: string
  ): Promise<{ success: boolean; message: string; status: string; error?: string }> {
    const student = await this.getStudentById(student_id)
    if (!student) {
      return { success: false, message: "Student not found in registry.", error: "Student not found in registry.", status: "NONE" }
    }

    const now = new Date().toISOString()
    const newStatus = action === "APPROVE" ? "APPROVED" : "REJECTED"

    await withMongo(
      async (db) => {
        await db.collection("students").updateOne(
          { student_id },
          {
            $set: {
              face_reregistration_status: newStatus,
              face_reregistration_requested: false,
              ...(action === "APPROVE" && { face_registered: false }),
              updated_at: now,
            },
          }
        )
        await db.collection("face_requests").updateMany(
          { student_id, status: "PENDING" },
          {
            $set: {
              status: newStatus,
              admin_notes: admin_notes || (action === "APPROVE" ? "Approved by administrator" : "Rejected by administrator"),
              reviewed_at: now,
            },
          }
        )
      },
      (mem) => {
        const s = mem.students.get(student_id)
        if (s) {
          s.face_reregistration_status = newStatus
          s.face_reregistration_requested = false
          if (action === "APPROVE") s.face_registered = false
          s.updated_at = now
        }
        for (const req of mem.faceRequests.values()) {
          if (req.student_id === student_id && req.status === "PENDING") {
            req.status = newStatus
            req.admin_notes = admin_notes || (action === "APPROVE" ? "Approved by administrator" : "Rejected by administrator")
            req.reviewed_at = now
          }
        }
      }
    )

    return {
      success: true,
      message:
        action === "APPROVE"
          ? "Re-registration request approved. Student may now register a new face profile."
          : "Re-registration request rejected.",
      status: newStatus,
    }
  }

  async getFaceStats(): Promise<{
    total_students: number
    registered_faces: number
    unregistered_faces: number
    pending_reregistrations: number
    registration_rate: string
  }> {
    const students = await this.getStudents()
    const requests = await this.getFaceReRegistrationRequests()

    const total = students.length
    const registered = students.filter((s) => s.face_registered).length
    const unregistered = total - registered
    const pendingReqs = requests.filter((r) => r.status === "PENDING").length
    const rate = total > 0 ? `${Math.round((registered / total) * 100)}%` : "0%"

    return {
      total_students: total,
      registered_faces: registered,
      unregistered_faces: unregistered,
      pending_reregistrations: pendingReqs,
      registration_rate: rate,
    }
  }

  // -------------------------------------------------------------------------
  // Multi-Face Recognition & Attendance Engine (Supports up to 4 simultaneous faces)
  // -------------------------------------------------------------------------
  async recognizeAndProcessFaces(params: {
    bus_id: string
    stop?: string
    driver_id?: string
    faces: Array<{
      embedding: number[]
      bbox?: { x: number; y: number; width: number; height: number }
    }>
  }): Promise<{
    success: boolean
    processed_faces: Array<{
      face_index: number
      student_id: string
      name: string
      status: "RECOGNIZED" | "UNKNOWN" | "LOW CONFIDENCE" | "ALREADY BOARDED" | "DENIED - FEE NOT VALID"
      confidence: number
      fee_status: string
      assigned_bus: string
      boarding_status: string
      message: string
      bbox?: { x: number; y: number; width: number; height: number }
    }>
    count: number
    overflow: boolean
    message: string
    bus: {
      bus_id: string
      passengers: number
      capacity: number
      available_seats: number
    }
  }> {
    const bus_id = params.bus_id.trim() || "BUS-01"
    const stop = params.stop || "Campus Terminal"
    const rawFaces = Array.isArray(params.faces) ? params.faces : []
    const overflow = rawFaces.length > 4
    // Process up to 4 faces simultaneously
    const facesToProcess = rawFaces.slice(0, 4)

    const bus = (await this.getBusById(bus_id)) || (await this.getBuses())[0] || {
      bus_id,
      bus_name: bus_id,
      route: "Route A",
      driver_name: "Transit Driver",
      plate_number: bus_id,
      capacity: 40,
      passengers: 0,
    }

    const students = await this.getStudents()
    const registeredStudents = students.filter(
      (s) => s.face_registered && Array.isArray(s.face_embedding) && s.face_embedding.length === 128
    )

    const now = new Date()
    const timestamp = now.toISOString()
    const dateStr = timestamp.split("T")[0]
    const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })

    const SIMILARITY_THRESHOLD = 0.70
    const results: Array<{
      face_index: number
      student_id: string
      name: string
      status: "RECOGNIZED" | "UNKNOWN" | "LOW CONFIDENCE" | "ALREADY BOARDED" | "DENIED - FEE NOT VALID"
      confidence: number
      fee_status: string
      assigned_bus: string
      boarding_status: string
      message: string
      bbox?: { x: number; y: number; width: number; height: number }
    }> = []

    let currentPassengers = bus.passengers || 0

    for (let i = 0; i < facesToProcess.length; i++) {
      const face = facesToProcess[i]
      const embedding = face.embedding

      if (!embedding || embedding.length !== 128) {
        results.push({
          face_index: i + 1,
          student_id: "UNKNOWN",
          name: "Invalid Face Data",
          status: "UNKNOWN",
          confidence: 0,
          fee_status: "UNKNOWN",
          assigned_bus: "NONE",
          boarding_status: "NOT BOARDED",
          message: "Unable to extract biometric representation",
          bbox: face.bbox,
        })
        continue
      }

      // Compute similarity across all registered students
      let bestStudent: StudentDoc | null = null
      let highestSim = 0

      for (const st of registeredStudents) {
        const sim = computeCosineSimilarity(embedding, st.face_embedding!)
        if (sim > highestSim) {
          highestSim = sim
          bestStudent = st
        }
      }

      const confPercent = Number(highestSim.toFixed(2))

      // 1. Unknown / Unregistered Face
      if (highestSim < 0.50 || !bestStudent) {
        results.push({
          face_index: i + 1,
          student_id: "UNKNOWN",
          name: "Unknown / Not Registered",
          status: "UNKNOWN",
          confidence: confPercent,
          fee_status: "UNKNOWN",
          assigned_bus: "NONE",
          boarding_status: "NOT BOARDED",
          message: "Student face is not registered in transit registry.",
          bbox: face.bbox,
        })
        continue
      }

      // 2. Low Confidence Face
      if (highestSim < SIMILARITY_THRESHOLD) {
        results.push({
          face_index: i + 1,
          student_id: bestStudent.student_id,
          name: bestStudent.name,
          status: "LOW CONFIDENCE",
          confidence: confPercent,
          fee_status: bestStudent.fee_status,
          assigned_bus: bestStudent.bus_id,
          boarding_status: "NOT BOARDED",
          message: `Face match (${Math.round(confPercent * 100)}%) is below recognition threshold (70%).`,
          bbox: face.bbox,
        })
        continue
      }

      // 3. Recognized Student -> Fee Validation Check
      const fee = await this.getFeeForStudent(bestStudent.student_id)
      const isFeePending = bestStudent.fee_status === "PENDING" || (fee && fee.fee_status === "PENDING")
      const validUntilStr = fee?.valid_until || bestStudent.fee_valid_until
      const isExpired = validUntilStr ? new Date(validUntilStr).getTime() < new Date(dateStr).getTime() : false

      if (isFeePending || isExpired) {
        const reason = isExpired ? "Pass Expired" : "Transport Fee Payment Pending"
        const deniedDoc: AttendanceDoc = {
          student_id: bestStudent.student_id,
          name: bestStudent.name,
          bus_id: bus.bus_id,
          route: bus.route || bestStudent.bus_id,
          driver: bus.driver_name || "Unassigned",
          plate_number: bus.plate_number || bus.bus_id,
          stop,
          fee_status: bestStudent.fee_status,
          event_type: "DENIED",
          status: "DENIED",
          recognition_result: "DENIED - FEE NOT VALID",
          confidence: confPercent,
          date: dateStr,
          time: timeStr,
          timestamp,
        }

        await withMongo(
          async (db) => {
            await db.collection("attendance").insertOne(deniedDoc)
          },
          (mem) => {
            mem.attendance.unshift(deniedDoc)
          }
        )

        results.push({
          face_index: i + 1,
          student_id: bestStudent.student_id,
          name: bestStudent.name,
          status: "DENIED - FEE NOT VALID",
          confidence: confPercent,
          fee_status: bestStudent.fee_status,
          assigned_bus: bestStudent.bus_id,
          boarding_status: "DENIED",
          message: `Denied: ${reason}. Please clear dues with transit office.`,
          bbox: face.bbox,
        })
        continue
      }

      // 4. Duplicate Boarding Protection:
      // If student is already boarded, do not create duplicate boarding event or increment passenger count
      if (bestStudent.is_boarded) {
        results.push({
          face_index: i + 1,
          student_id: bestStudent.student_id,
          name: bestStudent.name,
          status: "ALREADY BOARDED",
          confidence: confPercent,
          fee_status: bestStudent.fee_status,
          assigned_bus: bestStudent.bus_id,
          boarding_status: "Already Boarded",
          message: "Student has already boarded this bus.",
          bbox: face.bbox,
        })
        continue
      }

      // 5. Valid New Boarding Event -> Record Attendance & Increment Passenger Count
      const boardedDoc: AttendanceDoc = {
        student_id: bestStudent.student_id,
        name: bestStudent.name,
        bus_id: bus.bus_id,
        route: bus.route || bestStudent.bus_id,
        driver: bus.driver_name || "Unassigned",
        plate_number: bus.plate_number || bus.bus_id,
        stop,
        fee_status: bestStudent.fee_status,
        event_type: "BOARDED",
        status: "BOARDED",
        recognition_result: "RECOGNIZED",
        confidence: confPercent,
        date: dateStr,
        time: timeStr,
        timestamp,
      }

      currentPassengers = Math.min(bus.capacity, currentPassengers + 1)

      // Persist boarding
      await withMongo(
        async (db) => {
          await db.collection("attendance").insertOne(boardedDoc)
          await db.collection("students").updateOne(
            { student_id: bestStudent!.student_id },
            { $set: { is_boarded: true, updated_at: timestamp } }
          )
          await db.collection("buses").updateOne(
            { bus_id: bus.bus_id },
            { $set: { passengers: currentPassengers, updated_at: timestamp } }
          )
        },
        (mem) => {
          mem.attendance.unshift(boardedDoc)
          const st = mem.students.get(bestStudent!.student_id)
          if (st) st.is_boarded = true
          const b = mem.buses.get(bus.bus_id)
          if (b) b.passengers = currentPassengers
        }
      )

      // Mark locally in current loop
      bestStudent.is_boarded = true

      results.push({
        face_index: i + 1,
        student_id: bestStudent.student_id,
        name: bestStudent.name,
        status: "RECOGNIZED",
        confidence: confPercent,
        fee_status: bestStudent.fee_status,
        assigned_bus: bestStudent.bus_id,
        boarding_status: "BOARDED",
        message: `Verified entry: Boarded successfully at ${stop}`,
        bbox: face.bbox,
      })
    }

    return {
      success: true,
      processed_faces: results,
      count: results.length,
      overflow,
      message: overflow
        ? "Maximum 4 faces can be processed simultaneously."
        : `Processed ${results.length} detected face(s).`,
      bus: {
        bus_id: bus.bus_id,
        passengers: currentPassengers,
        capacity: bus.capacity,
        available_seats: Math.max(0, bus.capacity - currentPassengers),
      },
    }
  }
}

export const serverDb = new MongoDatabaseService()
