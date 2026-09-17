const API_URL = ""

// =========================================================
// GENERIC API REQUEST
// =========================================================

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("smart_bus_access_token")
      : null

  const headers = new Headers(options.headers)

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json")
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  const response = await fetch(
    `${API_URL}${endpoint}`,
    {
      ...options,
      headers,
    }
  )

  // -------------------------------------------------------
  // AUTHENTICATION EXPIRED
  // -------------------------------------------------------

  if (response.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem(
        "smart_bus_access_token"
      )

      localStorage.removeItem(
        "smart_bus_user"
      )

      localStorage.removeItem(
        "username"
      )

      localStorage.removeItem(
        "role"
      )
    }

    throw new Error(
      "Authentication expired. Please login again."
    )
  }

  // -------------------------------------------------------
  // API ERROR
  // -------------------------------------------------------

  if (!response.ok) {
    let message =
      `Request failed with status ${response.status}`

    try {
      const errorData =
        await response.json()

      if (
        typeof errorData.detail ===
        "string"
      ) {
        message =
          errorData.detail
      } else if (
        typeof errorData.message ===
        "string"
      ) {
        message =
          errorData.message
      }
    } catch {
      // Ignore JSON parsing errors.
    }

    throw new Error(message)
  }

  return response.json()
}


// =========================================================
// AUTHENTICATION
// =========================================================

export interface LoginResponse {
  access_token: string
  token_type: string
  role: string
  username: string
}

export interface CurrentUser {
  username: string
  role: "ADMIN" | "DRIVER" | "STUDENT"
  reference_id?: string | null
  full_name?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
  department?: string | null
  student_id?: string | null
  assigned_bus?: string | null
}


// =========================================================
// LOGIN
// =========================================================

export async function login(
  username: string,
  password: string
): Promise<LoginResponse> {
  const body =
    new URLSearchParams()

  body.append(
    "username",
    username
  )

  body.append(
    "password",
    password
  )

  const response =
    await fetch(
      `${API_URL}/api/v1/auth/login`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },

        body,
      }
    )

  if (!response.ok) {
    let message =
      "Incorrect username or password."

    try {
      const data =
        await response.json()

      if (
        typeof data.detail ===
        "string"
      ) {
        message =
          data.detail
      }
    } catch {
      // Ignore parsing errors.
    }

    throw new Error(message)
  }

  return response.json()
}


// =========================================================
// CURRENT USER
// =========================================================

export async function getCurrentUser(): Promise<CurrentUser> {
  return apiRequest<CurrentUser>(
    "/api/v1/auth/me"
  )
}


// =========================================================
// SMART BUS OVERVIEW
// =========================================================

export interface Overview {
  total_buses: number

  total_students: number

  active_passengers: number

  boarded_events: number

  exited_events: number

  emergency_events: number
}


export async function getOverview(): Promise<Overview> {
  return apiRequest<Overview>(
    "/api/v1/smart-bus/overview"
  )
}

export async function getDashboard(): Promise<any> {
  return apiRequest<any>(
    "/api/v1/dashboard"
  )
}

export async function getMyFee(): Promise<{
  student_id: string
  academic_year: string
  total_fee: number
  paid_amount: number
  pending_amount: number
  status: "PAID" | "PARTIAL" | "PENDING"
  payment_date?: string
  valid_until?: string
} | null> {
  try {
    return await apiRequest("/api/v1/fees/my-fee")
  } catch {
    return null
  }
}


// =========================================================
// BUS
// =========================================================

export interface Bus {
  bus_id: string

  bus_name?: string

  plate_number?: string

  capacity?: number

  current_passengers?: number

  available_seats?: number

  status?: string

  driver_name?: string

  route?: string

  stops?: string[]

  assigned_students?: string[]

  area?: string

  city?: string

  state?: string

  country?: string

  latitude?: number

  longitude?: number

  gps?: {
    latitude?: number
    longitude?: number
    speed?: number
    heading?: number
    area?: string
    city?: string
    state?: string
    country?: string
    timestamp?: string
  }
}


export async function getBuses(): Promise<Bus[]> {
  const response =
    await apiRequest<{
      buses?: Bus[]
    }>(
      "/api/v1/smart-bus/buses"
    )

  return response.buses ?? []
}


export async function getBus(
  busId: string
): Promise<Bus> {
  return apiRequest<Bus>(
    `/api/v1/smart-bus/buses/${encodeURIComponent(
      busId
    )}`
  )
}


// =========================================================
// PASSENGERS
// =========================================================

export interface Passenger {
  student_id?: string

  name?: string

  bus_id?: string

  stop?: string

  status?: string

  timestamp?: string
}


export async function getPassengers(): Promise<Passenger[]> {
  const response =
    await apiRequest<{
      passengers?: Passenger[]
    }>(
      "/api/v1/smart-bus/passengers"
    )

  return response.passengers ?? []
}


// =========================================================
// ATTENDANCE
// =========================================================

export interface Attendance {
  student_id?: string

  name?: string

  bus_id?: string

  plate_number?: string

  stop?: string

  fee_status?: string

  date?: string

  time?: string

  status?: string
}


export async function getAttendance(): Promise<Attendance[]> {
  const data =
    await apiRequest<{
      attendance: Attendance[]

      count: number
    }>(
      "/api/v1/smart-bus/attendance"
    )

  return data.attendance ?? []
}


// =========================================================
// EMERGENCIES
// =========================================================

export interface Emergency {
  bus_id?: string

  driver?: string

  type?: string

  message?: string

  status?: string

  timestamp?: string
}


export async function getEmergencies(): Promise<Emergency[]> {
  const response =
    await apiRequest<{
      emergencies?: Emergency[]
    }>(
      "/api/v1/smart-bus/emergencies"
    )

  return response.emergencies ?? []
}


// =========================================================
// BUS ENTRY & ATTENDANCE (Non-QR: Camera / Vision / RFID / Terminal)
// =========================================================

export interface AttendanceEventResult {
  success: boolean
  action: "BOARDED" | "EXITED" | "DENIED" | "UNKNOWN"
  student_id?: string
  name?: string
  bus_id?: string
  stop?: string
  fee_status?: string
  message: string
  timestamp?: string
}

export type QRScanResult = AttendanceEventResult

export async function recordAttendanceEvent(
  studentId: string,
  busId: string,
  stop?: string,
  eventType?: "BOARDED" | "EXITED" | "AUTO" | "DENIED"
): Promise<AttendanceEventResult> {
  return apiRequest<AttendanceEventResult>(
    "/api/v1/smart-bus/entry-events",
    {
      method: "POST",
      body: JSON.stringify({
        student_id: studentId,
        bus_id: busId,
        stop: stop || "",
        event_type: eventType || "AUTO",
      }),
    }
  )
}

// Backwards-compatible alias for existing callers
export async function scanQr(
  studentId: string,
  busId: string,
  stop?: string
): Promise<AttendanceEventResult> {
  return recordAttendanceEvent(studentId, busId, stop)
}


// =========================================================
// GPS
// =========================================================

export interface GPSLocation {
  success: boolean

  available: boolean

  assigned?: boolean

  bus_id: string

  latitude?: number

  longitude?: number

  speed?: number | null

  heading?: number | null

  area?: string

  city?: string

  state?: string

  country?: string

  timestamp?: string

  updated_at?: string

  message?: string
}


// =========================================================
// UPDATE BUS GPS
// =========================================================

export async function updateBusGPS(
  busId: string,
  latitude: number,
  longitude: number,
  speed?: number | null,
  heading?: number | null
): Promise<GPSLocation> {
  return apiRequest<GPSLocation>(
    "/api/v1/smart-bus/gps",
    {
      method: "POST",

      body: JSON.stringify({
        bus_id:
          busId,

        latitude:
          latitude,

        longitude:
          longitude,

        speed:
          speed,

        heading:
          heading,

        timestamp:
          new Date().toISOString(),
      }),
    }
  )
}


// =========================================================
// GET SPECIFIC BUS LOCATION
// =========================================================

export async function getBusLocation(
  busId: string
): Promise<GPSLocation> {
  return apiRequest<GPSLocation>(
    `/api/v1/smart-bus/buses/${encodeURIComponent(
      busId
    )}/location`
  )
}


// =========================================================
// GET MY ASSIGNED BUS LOCATION
// =========================================================

export async function getMyBusLocation(): Promise<GPSLocation> {
  return apiRequest<GPSLocation>(
    "/api/v1/smart-bus/my-bus/location"
  )
}


// =========================================================
// BUS MANAGEMENT
// ADMIN
// =========================================================

export interface ManagedBus {
  bus_id: string

  bus_name: string

  plate_number: string

  capacity: number

  stops: string[]

  current_passengers: number

  available_seats: number

  driver: {
    username: string

    full_name: string
  } | null
}


export interface ManagedDriver {
  username: string
  full_name: string
  name?: string
  email?: string
  phone?: string
  license_number?: string
  assigned_bus?: string | null
  status?: string
}


// =========================================================
// GET MANAGED BUSES
// =========================================================

export async function getManagedBuses(): Promise<ManagedBus[]> {
  const data =
    await apiRequest<{
      buses: ManagedBus[]

      count: number
    }>(
      "/api/v1/smart-bus/management/buses"
    )

  return data.buses ?? []
}


// =========================================================
// GET MANAGED DRIVERS
// =========================================================

export async function getManagedDrivers(): Promise<ManagedDriver[]> {
  const data =
    await apiRequest<{
      drivers: ManagedDriver[]

      count: number
    }>(
      "/api/v1/smart-bus/management/drivers"
    )

  return data.drivers ?? []
}


// =========================================================
// CREATE / UPDATE / DELETE DRIVER
// =========================================================

export async function createManagedDriver(data: {
  username: string
  name: string
  password?: string
  email?: string
  phone?: string
  license_number?: string
  assigned_bus?: string
}) {
  return apiRequest<{
    success: boolean
    driver: ManagedDriver
  }>(
    "/api/v1/smart-bus/management/drivers",
    {
      method: "POST",
      body: JSON.stringify(data),
    }
  )
}

export async function updateManagedDriver(
  username: string,
  data: {
    name?: string
    email?: string
    phone?: string
    license_number?: string
    assigned_bus?: string | null
  }
) {
  return apiRequest<{
    success: boolean
    driver: ManagedDriver
  }>(
    `/api/v1/smart-bus/management/drivers/${encodeURIComponent(username)}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    }
  )
}

export async function deleteManagedDriver(username: string) {
  return apiRequest<{
    success: boolean
    message: string
  }>(
    `/api/v1/smart-bus/management/drivers/${encodeURIComponent(username)}`,
    {
      method: "DELETE",
    }
  )
}


// =========================================================
// ASSIGN DRIVER TO BUS
// =========================================================

export async function assignDriverToBus(
  busId: string,
  username: string
) {
  return apiRequest<{
    success: boolean

    message: string

    bus_id: string

    driver: {
      username: string

      full_name: string
    }
  }>(
    `/api/v1/smart-bus/management/buses/${encodeURIComponent(
      busId
    )}/driver`,
    {
      method: "PUT",

      body: JSON.stringify({
        username,
      }),
    }
  )
}


// =========================================================
// UPDATE MANAGED BUS
// =========================================================

export async function updateManagedBus(
  busId: string,
  data: {
    bus_name?: string

    plate_number?: string

    capacity?: number

    stops?: string[]
  }
) {
  return apiRequest(
    `/api/v1/smart-bus/management/buses/${encodeURIComponent(
      busId
    )}`,
    {
      method: "PUT",

      body: JSON.stringify(
        data
      ),
    }
  )
}


// =========================================================
// CREATE MANAGED BUS
// =========================================================

export async function createManagedBus(
  data: {
    bus_id: string

    bus_name: string

    plate_number: string

    capacity: number

    stops: string[]
  }
) {
  return apiRequest(
    "/api/v1/smart-bus/management/buses",
    {
      method: "POST",

      body: JSON.stringify(
        data
      ),
    }
  )
}

export async function deleteManagedBus(busId: string) {
  return apiRequest<{
    success: boolean
    message: string
  }>(
    `/api/v1/smart-bus/management/buses/${encodeURIComponent(busId)}`,
    {
      method: "DELETE",
    }
  )
}


// =========================================================
// STUDENT MANAGEMENT
// ADMIN
// =========================================================

export interface ManagedStudent {
  student_id: string
  name: string
  email?: string | null
  phone?: string | null
  department?: string | null
  year?: string | null
  assigned_bus?: string | null
  fee_status?: string | null
  fee_total?: number
  fee_paid?: number
  fee_pending?: number
  fee_valid_until?: string | null
  is_boarded: boolean
}


// =========================================================
// GET MANAGED STUDENTS
// =========================================================

export async function getManagedStudents(): Promise<ManagedStudent[]> {
  const data =
    await apiRequest<{
      students: ManagedStudent[]

      count: number
    }>(
      "/api/v1/smart-bus/management/students"
    )

  return data.students ?? []
}


// =========================================================
// CREATE STUDENT
// =========================================================

export async function createManagedStudent(
  data: {
    student_id: string
    name: string
    email?: string
    phone?: string
    department?: string
    year?: string
    semester?: string
    assigned_bus?: string
    fee_total?: number
    fee_paid?: number
    fee_valid_until?: string
    password?: string
  }
) {
  return apiRequest<{
    success: boolean
    message: string
    student: ManagedStudent
    email_dispatch?: {
      sent: boolean
      recipient: string
      note?: string
    }
  }>(
    "/api/v1/smart-bus/management/students",
    {
      method: "POST",
      body: JSON.stringify(data),
    }
  )
}


// =========================================================
// UPDATE STUDENT
// =========================================================

export async function updateManagedStudent(
  studentId: string,
  data: {
    name?: string

    email?: string

    phone?: string

    assigned_bus?: string
  }
) {
  return apiRequest<{
    success: boolean

    message: string

    student: ManagedStudent
  }>(
    `/api/v1/smart-bus/management/students/${encodeURIComponent(
      studentId
    )}`,
    {
      method: "PUT",

      body: JSON.stringify(
        data
      ),
    }
  )
}

export async function deleteManagedStudent(studentId: string) {
  return apiRequest<{
    success: boolean
    message: string
  }>(
    `/api/v1/smart-bus/management/students/${encodeURIComponent(studentId)}`,
    {
      method: "DELETE",
    }
  )
}


// =========================================================
// FEE MANAGEMENT
// ADMIN
// =========================================================

export interface ManagedFee {
  student_id: string

  student_name?: string | null

  academic_year: string

  total_fee: number

  paid_amount: number

  pending_amount: number

  status:
    | "PAID"
    | "PARTIAL"
    | "PENDING"

  last_payment_date?: string | null
}


// =========================================================
// GET FEES
// =========================================================

export async function getManagedFees(): Promise<ManagedFee[]> {
  const data =
    await apiRequest<{
      fees: ManagedFee[]

      count: number
    }>(
      "/api/v1/smart-bus/management/fees"
    )

  return data.fees ?? []
}


// =========================================================
// CREATE FEE
// =========================================================

export async function createManagedFee(
  data: {
    student_id: string

    academic_year: string

    total_fee: number

    paid_amount: number
  }
) {
  return apiRequest<{
    success: boolean

    message: string

    fee: ManagedFee
  }>(
    "/api/v1/smart-bus/management/fees",
    {
      method: "POST",

      body: JSON.stringify(
        data
      ),
    }
  )
}


// =========================================================
// UPDATE FEE
// =========================================================

export async function updateManagedFee(
  studentId: string,
  data: {
    academic_year?: string

    total_fee?: number

    paid_amount?: number
  }
) {
  return apiRequest<{
    success: boolean

    message: string

    fee: ManagedFee
  }>(
    `/api/v1/smart-bus/management/fees/${encodeURIComponent(
      studentId
    )}`,
    {
      method: "PUT",

      body: JSON.stringify(
        data
      ),
    }
  )
}