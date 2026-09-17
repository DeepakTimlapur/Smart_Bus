"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"

import {
  getCurrentUser,
  getOverview,
  getBuses,
  getAttendance,
  getEmergencies,
  getMyBusLocation,
  getManagedStudents,
  createManagedStudent,
  updateManagedStudent,
  getManagedBuses,
  getManagedFees,
  createManagedFee,
  updateManagedFee,
  type Overview,
  type Bus,
  type Attendance,
  type Emergency,
  type GPSLocation,
  type ManagedStudent,
  type ManagedBus,
  type ManagedFee,
} from "@/lib/api"

import DriverGPS from "@/components/smart-bus/DriverGPS"


// =========================================================
// THEME
// =========================================================

const DARK_THEME = {
  page: "#09090b",
  card: "#111318",
  cardAlt: "#181b21",
  border: "#272b33",
  text: "#f4f4f5",
  textSecondary: "#a1a1aa",
  muted: "#71717a",
  input: "#181b21",
  inputBorder: "#30343d",
  button: "#f4f4f5",
  buttonText: "#09090b",
  buttonSecondary: "#181b21",
  buttonSecondaryText: "#f4f4f5",
  tableBorder: "#272b33",
  hover: "#1c2027",
  modal: "#111318",
}

const LIGHT_THEME = {
  page: "#f8fafc",
  card: "#ffffff",
  cardAlt: "#f8fafc",
  border: "#e5e7eb",
  text: "#111827",
  textSecondary: "#4b5563",
  muted: "#6b7280",
  input: "#ffffff",
  inputBorder: "#d1d5db",
  button: "#111827",
  buttonText: "#ffffff",
  buttonSecondary: "#ffffff",
  buttonSecondaryText: "#111827",
  tableBorder: "#e5e7eb",
  hover: "#f3f4f6",
  modal: "#ffffff",
}


// =========================================================
// MAIN DASHBOARD
// =========================================================

export default function DashboardPage() {

  // =======================================================
  // THEME
  // =======================================================

  // DARK MODE IS DEFAULT
  const [darkMode, setDarkMode] = useState(true)

  const theme = darkMode
    ? DARK_THEME
    : LIGHT_THEME


  // =======================================================
  // USER
  // =======================================================

  const [username, setUsername] = useState("")
  const [role, setRole] = useState("")
  const [assignedBus, setAssignedBus] = useState("")


  // =======================================================
  // GENERAL
  // =======================================================

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")


  // =======================================================
  // DASHBOARD DATA
  // =======================================================

  const [overview, setOverview] =
    useState<Overview | null>(null)

  const [buses, setBuses] =
    useState<Bus[]>([])

  const [attendance, setAttendance] =
    useState<Attendance[]>([])

  const [emergencies, setEmergencies] =
    useState<Emergency[]>([])

  const [myBusLocation, setMyBusLocation] =
    useState<GPSLocation | null>(null)


  // =======================================================
  // STUDENT MANAGEMENT
  // =======================================================

  const [managedStudents, setManagedStudents] =
    useState<ManagedStudent[]>([])

  const [managedBuses, setManagedBuses] =
    useState<ManagedBus[]>([])

  const [studentSearch, setStudentSearch] =
    useState("")

  const [showStudentForm, setShowStudentForm] =
    useState(false)

  const [editingStudent, setEditingStudent] =
    useState<ManagedStudent | null>(null)

  const [studentId, setStudentId] =
    useState("")

  const [studentName, setStudentName] =
    useState("")

  const [studentEmail, setStudentEmail] =
    useState("")

  const [studentPhone, setStudentPhone] =
    useState("")

  const [studentBus, setStudentBus] =
    useState("")


  // =======================================================
  // FEE MANAGEMENT
  // =======================================================

  const [managedFees, setManagedFees] =
    useState<ManagedFee[]>([])

  const [feeSearch, setFeeSearch] =
    useState("")

  const [showFeeForm, setShowFeeForm] =
    useState(false)

  const [editingFee, setEditingFee] =
    useState<ManagedFee | null>(null)

  const [feeStudentId, setFeeStudentId] =
    useState("")

  const [feeAcademicYear, setFeeAcademicYear] =
    useState("2026-27")

  const [feeTotal, setFeeTotal] =
    useState("")

  const [feePaid, setFeePaid] =
    useState("")


  // =======================================================
  // INITIALIZE THEME
  // =======================================================

  useEffect(() => {

    const savedTheme =
      localStorage.getItem("smart_bus_theme")

    if (savedTheme === "light") {
      setDarkMode(false)
    } else {
      // DARK MODE DEFAULT
      setDarkMode(true)
    }

  }, [])


  // =======================================================
  // SAVE THEME
  // =======================================================

  useEffect(() => {

    if (typeof window !== "undefined") {

      localStorage.setItem(
        "smart_bus_theme",
        darkMode
          ? "dark"
          : "light"
      )

      document.body.style.backgroundColor =
        darkMode
          ? DARK_THEME.page
          : LIGHT_THEME.page

      document.body.style.color =
        darkMode
          ? DARK_THEME.text
          : LIGHT_THEME.text
    }

  }, [darkMode])


  // =======================================================
  // INITIALIZE DASHBOARD
  // =======================================================

  useEffect(() => {

    initializeDashboard()

  }, [])


  // =======================================================
  // INITIALIZE DASHBOARD
  // =======================================================

  async function initializeDashboard() {

    try {

      setLoading(true)
      setError("")

      const user =
        await getCurrentUser()


      // USERNAME
      setUsername(
        user.username || "User"
      )


      // ROLE
      setRole(
        user.role || ""
      )


      // DRIVER ASSIGNED BUS
      setAssignedBus(
        user.assigned_bus || ""
      )


      // SAVE USER DATA
      localStorage.setItem(
        "username",
        user.username || ""
      )

      localStorage.setItem(
        "role",
        user.role || ""
      )


      // LOAD ROLE-SPECIFIC DATA
      await loadDashboardData(
        user.role
      )

    } catch (err) {

      console.error(
        "Dashboard initialization error:",
        err
      )

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load dashboard"
      )

      setLoading(false)
    }
  }


  // =======================================================
  // LOAD DASHBOARD DATA
  // =======================================================

  async function loadDashboardData(
    currentRole: string
  ) {

    try {

      // =====================================================
      // COMMON DATA
      // =====================================================

      const [
        overviewData,
        busesData,
        attendanceData,
        emergencyData,
      ] = await Promise.all([
        getOverview(),
        getBuses(),
        getAttendance(),
        getEmergencies(),
      ])


      setOverview(
        overviewData
      )

      setBuses(
        busesData
      )

      setAttendance(
        attendanceData
      )

      setEmergencies(
        emergencyData
      )


      // =====================================================
      // ADMIN
      // =====================================================

      if (currentRole === "ADMIN") {

        await Promise.all([
          loadStudents(),
          loadManagedBuses(),
          loadFees(),
        ])

        // IMPORTANT:
        // ADMIN DOES NOT CALL getMyBusLocation()
        //
        // /my-bus/location is not an admin endpoint.
      }


      // =====================================================
      // DRIVER
      // =====================================================

      if (currentRole === "DRIVER") {

        // IMPORTANT:
        // DO NOT CALL getMyBusLocation() HERE.
        //
        // DriverGPS handles driver GPS updates.
        // assigned_bus comes from /auth/me.
      }


      // =====================================================
      // STUDENT
      // =====================================================

      if (currentRole === "STUDENT") {

        try {

          const location =
            await getMyBusLocation()

          setMyBusLocation(
            location
          )

        } catch (err) {

          console.error(
            "Student bus location unavailable:",
            err
          )

          setMyBusLocation(
            null
          )
        }
      }


      setLoading(false)

    } catch (err) {

      console.error(
        "Dashboard data loading error:",
        err
      )

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load dashboard"
      )

      setLoading(false)
    }
  }


  // =======================================================
  // ADMIN DATA
  // =======================================================

  async function loadStudents() {

    try {

      const students =
        await getManagedStudents()

      setManagedStudents(
        students
      )

    } catch (err) {

      console.error(
        "Failed to load students:",
        err
      )
    }
  }


  async function loadManagedBuses() {

    try {

      const buses =
        await getManagedBuses()

      setManagedBuses(
        buses
      )

    } catch (err) {

      console.error(
        "Failed to load managed buses:",
        err
      )
    }
  }


  async function loadFees() {

    try {

      const fees =
        await getManagedFees()

      setManagedFees(
        fees
      )

    } catch (err) {

      console.error(
        "Failed to load fees:",
        err
      )
    }
  }


  // =======================================================
  // STUDENT FORM
  // =======================================================

  function resetStudentForm() {

    setEditingStudent(null)

    setStudentId("")

    setStudentName("")

    setStudentEmail("")

    setStudentPhone("")

    setStudentBus("")
  }


  function openAddStudent() {

    resetStudentForm()

    setShowStudentForm(true)
  }


  function openEditStudent(
    student: ManagedStudent
  ) {

    setEditingStudent(
      student
    )

    setStudentId(
      student.student_id
    )

    setStudentName(
      student.name
    )

    setStudentEmail(
      student.email || ""
    )

    setStudentPhone(
      student.phone || ""
    )

    setStudentBus(
      student.assigned_bus || ""
    )

    setShowStudentForm(true)
  }


  // =======================================================
  // SAVE STUDENT
  // =======================================================

  async function saveStudent() {

    if (
      !studentId.trim() ||
      !studentName.trim()
    ) {

      alert(
        "Student ID and name are required"
      )

      return
    }


    try {

      if (editingStudent) {

        await updateManagedStudent(
          editingStudent.student_id,
          {
            name: studentName,
            email:
              studentEmail ||
              undefined,
            phone:
              studentPhone ||
              undefined,
            assigned_bus:
              studentBus ||
              undefined,
          }
        )

      } else {

        await createManagedStudent({
          student_id:
            studentId,
          name:
            studentName,
          email:
            studentEmail ||
            undefined,
          phone:
            studentPhone ||
            undefined,
          assigned_bus:
            studentBus ||
            undefined,
        })
      }


      await loadStudents()

      setShowStudentForm(
        false
      )

      resetStudentForm()

    } catch (err) {

      alert(
        err instanceof Error
          ? err.message
          : "Failed to save student"
      )
    }
  }


  // =======================================================
  // FEE FORM
  // =======================================================

  function openAddFee() {

    setEditingFee(null)

    setFeeStudentId("")

    setFeeAcademicYear(
      "2026-27"
    )

    setFeeTotal("")

    setFeePaid("")

    setShowFeeForm(true)
  }


  function openEditFee(
    fee: ManagedFee
  ) {

    setEditingFee(
      fee
    )

    setFeeStudentId(
      fee.student_id
    )

    setFeeAcademicYear(
      fee.academic_year
    )

    setFeeTotal(
      String(fee.total_fee)
    )

    setFeePaid(
      String(fee.paid_amount)
    )

    setShowFeeForm(true)
  }


  // =======================================================
  // SAVE FEE
  // =======================================================

  async function saveFee() {

    if (
      !feeStudentId ||
      !feeAcademicYear.trim()
    ) {

      alert(
        "Student and academic year are required"
      )

      return
    }


    const total =
      Number(feeTotal)

    const paid =
      Number(
        feePaid || 0
      )


    if (
      !Number.isFinite(total) ||
      total < 0
    ) {

      alert(
        "Enter a valid total fee"
      )

      return
    }


    if (
      !Number.isFinite(paid) ||
      paid < 0
    ) {

      alert(
        "Enter a valid paid amount"
      )

      return
    }


    if (paid > total) {

      alert(
        "Paid amount cannot exceed total fee"
      )

      return
    }


    try {

      if (editingFee) {

        await updateManagedFee(
          editingFee.student_id,
          {
            academic_year:
              feeAcademicYear,
            total_fee:
              total,
            paid_amount:
              paid,
          }
        )

      } else {

        await createManagedFee({
          student_id:
            feeStudentId,
          academic_year:
            feeAcademicYear,
          total_fee:
            total,
          paid_amount:
            paid,
        })
      }


      await loadFees()

      setShowFeeForm(
        false
      )

      setEditingFee(
        null
      )

    } catch (err) {

      alert(
        err instanceof Error
          ? err.message
          : "Failed to save fee"
      )
    }
  }


  // =======================================================
  // LOGOUT
  // =======================================================

  function logout() {

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

    window.location.href =
      "/login"
  }


  // =======================================================
  // FILTER STUDENTS
  // =======================================================

  const filteredStudents =
    useMemo(() => {

      const q =
        studentSearch
          .toLowerCase()
          .trim()


      if (!q) {

        return managedStudents
      }


      return managedStudents.filter(
        (student) =>
          student.student_id
            .toLowerCase()
            .includes(q) ||

          student.name
            .toLowerCase()
            .includes(q) ||

          (student.email || "")
            .toLowerCase()
            .includes(q)
      )

    }, [
      managedStudents,
      studentSearch,
    ])


  // =======================================================
  // FILTER FEES
  // =======================================================

  const filteredFees =
    useMemo(() => {

      const q =
        feeSearch
          .toLowerCase()
          .trim()


      if (!q) {

        return managedFees
      }


      return managedFees.filter(
        (fee) =>
          fee.student_id
            .toLowerCase()
            .includes(q) ||

          (fee.student_name || "")
            .toLowerCase()
            .includes(q)
      )

    }, [
      managedFees,
      feeSearch,
    ])


  // =======================================================
  // FEE TOTALS
  // =======================================================

  const totalFees =
    managedFees.reduce(
      (sum, fee) =>
        sum + fee.total_fee,
      0
    )


  const collectedFees =
    managedFees.reduce(
      (sum, fee) =>
        sum + fee.paid_amount,
      0
    )


  const pendingFees =
    managedFees.reduce(
      (sum, fee) =>
        sum + fee.pending_amount,
      0
    )


  // =======================================================
  // LOADING
  // =======================================================

  if (loading) {

    return (

      <main
        style={{
          minHeight:
            "100vh",

          display:
            "grid",

          placeItems:
            "center",

          backgroundColor:
            theme.page,

          color:
            theme.text,

          fontSize:
            "16px",

          fontWeight:
            600,
        }}
      >

        Loading Smart Bus Dashboard...

      </main>
    )
  }


  // =======================================================
  // MAIN UI
  // =======================================================

  return (

    <main
      style={{
        minHeight:
          "100vh",

        backgroundColor:
          theme.page,

        color:
          theme.text,

        padding:
          "90px 24px 40px",

        transition:
          "background-color .25s ease, color .25s ease",
      }}
    >

      {/* ===================================================
          TOP LEFT DARK / LIGHT MODE
      =================================================== */}

      <div
        style={{
          position:
            "fixed",

          top:
            "18px",

          left:
            "20px",

          zIndex:
            2000,

          display:
            "flex",

          alignItems:
            "center",

          gap:
            "8px",

          padding:
            "5px",

          borderRadius:
            "12px",

          backgroundColor:
            theme.card,

          border:
            `1px solid ${theme.border}`,

          boxShadow:
            darkMode
              ? "0 8px 30px rgba(0,0,0,.35)"
              : "0 8px 30px rgba(0,0,0,.10)",
        }}
      >

        {/* DARK MODE */}

        <button
          onClick={() =>
            setDarkMode(true)
          }
          title="Dark mode"
          style={{
            border:
              "none",

            borderRadius:
              "8px",

            padding:
              "8px 12px",

            cursor:
              "pointer",

            fontWeight:
              700,

            fontSize:
              "13px",

            backgroundColor:
              darkMode
                ? theme.button
                : "transparent",

            color:
              darkMode
                ? theme.buttonText
                : theme.textSecondary,

            transition:
              "all .2s ease",
          }}
        >

          🌙 Dark

        </button>


        {/* LIGHT MODE */}

        <button
          onClick={() =>
            setDarkMode(false)
          }
          title="Light mode"
          style={{
            border:
              "none",

            borderRadius:
              "8px",

            padding:
              "8px 12px",

            cursor:
              "pointer",

            fontWeight:
              700,

            fontSize:
              "13px",

            backgroundColor:
              !darkMode
                ? theme.button
                : "transparent",

            color:
              !darkMode
                ? theme.buttonText
                : theme.textSecondary,

            transition:
              "all .2s ease",
          }}
        >

          ☀️ Light

        </button>

      </div>


      {/* ===================================================
          CONTENT
      =================================================== */}

      <div
        style={{
          maxWidth:
            "1400px",

          margin:
            "0 auto",
        }}
      >


        {/* =================================================
            HEADER
        ================================================= */}

        <header
          style={{
            ...cardStyle(theme),

            display:
              "flex",

            justifyContent:
              "space-between",

            alignItems:
              "center",

            gap:
              "16px",

            flexWrap:
              "wrap",

            marginBottom:
              "24px",
          }}
        >

          <div>

            <h1
              style={{
                margin:
                  0,

                fontSize:
                  "30px",

                fontWeight:
                  800,

                letterSpacing:
                  "-0.5px",
              }}
            >

              Smart Bus Dashboard

            </h1>


            <p
              style={{
                margin:
                  "8px 0 0",

                color:
                  theme.textSecondary,

                fontSize:
                  "16px",
              }}
            >

              Welcome,{" "}

              <strong>
                {username ||
                  "User"}
              </strong>

            </p>


            <div
              style={{
                marginTop:
                  "8px",

                fontSize:
                  "12px",

                fontWeight:
                  800,

                letterSpacing:
                  "0.5px",

                color:
                  theme.textSecondary,
              }}
            >

              ROLE:{" "}

              <span
                style={{
                  color:
                    theme.text,
                }}
              >

                {role ||
                  "UNKNOWN"}

              </span>

            </div>


            {role === "DRIVER" &&
              assignedBus && (

                <div
                  style={{
                    marginTop:
                      "6px",

                    fontSize:
                      "13px",

                    color:
                      theme.textSecondary,
                  }}
                >

                  Assigned Bus:{" "}

                  <strong
                    style={{
                      color:
                        theme.text,
                    }}
                  >

                    {assignedBus}

                  </strong>

                </div>

              )}

          </div>


          <button
            onClick={
              logout
            }
            style={{
              ...primaryButton(theme),

              padding:
                "11px 20px",

              fontSize:
                "14px",
            }}
          >

            Logout

          </button>

        </header>


        {/* =================================================
            ERROR
        ================================================= */}

        {error && (

          <div
            style={{
              backgroundColor:
                darkMode
                  ? "#3f1515"
                  : "#fee2e2",

              color:
                darkMode
                  ? "#fecaca"
                  : "#991b1b",

              border:
                "1px solid #ef4444",

              borderRadius:
                "12px",

              padding:
                "14px 16px",

              marginBottom:
                "20px",
            }}
          >

            {error}

          </div>

        )}


        {/* =================================================
            OVERVIEW
        ================================================= */}

        {overview && (

          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "repeat(auto-fit,minmax(180px,1fr))",

              gap:
                "14px",

              marginBottom:
                "24px",
            }}
          >

            <SummaryCard
              theme={theme}
              title="Total Buses"
              value={
                overview.total_buses
              }
            />


            <SummaryCard
              theme={theme}
              title="Students"
              value={
                overview.total_students
              }
            />


            <SummaryCard
              theme={theme}
              title="Active Passengers"
              value={
                overview.active_passengers
              }
            />


            <SummaryCard
              theme={theme}
              title="Boarded Events"
              value={
                overview.boarded_events
              }
            />


            <SummaryCard
              theme={theme}
              title="Exited Events"
              value={
                overview.exited_events
              }
            />


            <SummaryCard
              theme={theme}
              title="Emergency Events"
              value={
                overview.emergency_events
              }
            />

          </div>

        )}


        {/* =================================================
            ADMIN
        ================================================= */}

        {role === "ADMIN" && (

          <>

            {/* =============================================
                STUDENT MANAGEMENT
            ============================================= */}

            <section
              style={{
                ...cardStyle(theme),

                marginBottom:
                  "24px",
              }}
            >

              <SectionHeader
                theme={theme}
                title="Student Management"
                subtitle="Manage student records and bus assignments"
                button="+ Add Student"
                onClick={
                  openAddStudent
                }
              />


              <input
                value={
                  studentSearch
                }
                onChange={(event) =>
                  setStudentSearch(
                    event.target.value
                  )
                }
                placeholder="Search by student ID, name or email..."
                style={{
                  ...inputStyle(theme),

                  marginBottom:
                    "20px",
                }}
              />


              <TableWrap>

                <table
                  style={{
                    ...tableStyle,

                    minWidth:
                      "850px",
                  }}
                >

                  <thead>

                    <tr>

                      {[
                        "Student",
                        "Email",
                        "Phone",
                        "Bus",
                        "Status",
                        "Action",
                      ].map(
                        (heading) => (

                          <th
                            key={
                              heading
                            }
                            style={
                              thStyle(theme)
                            }
                          >

                            {heading}

                          </th>

                        )
                      )}

                    </tr>

                  </thead>


                  <tbody>

                    {filteredStudents.map(
                      (student) => (

                        <tr
                          key={
                            student.student_id
                          }
                        >

                          <td
                            style={
                              tdStyle(theme)
                            }
                          >

                            <strong>
                              {
                                student.name
                              }
                            </strong>

                            <div
                              style={
                                mutedStyle(theme)
                              }
                            >

                              {
                                student.student_id
                              }

                            </div>

                          </td>


                          <td
                            style={
                              tdStyle(theme)
                            }
                          >

                            {
                              student.email ||
                              "—"
                            }

                          </td>


                          <td
                            style={
                              tdStyle(theme)
                            }
                          >

                            {
                              student.phone ||
                              "—"
                            }

                          </td>


                          <td
                            style={
                              tdStyle(theme)
                            }
                          >

                            {
                              student.assigned_bus ||
                              "Not assigned"
                            }

                          </td>


                          <td
                            style={
                              tdStyle(theme)
                            }
                          >

                            <StatusBadge
                              label={
                                student.is_boarded
                                  ? "BOARDED"
                                  : "NOT BOARDED"
                              }
                            />

                          </td>


                          <td
                            style={
                              tdStyle(theme)
                            }
                          >

                            <button
                              onClick={() =>
                                openEditStudent(
                                  student
                                )
                              }
                              style={
                                secondaryButton(
                                  theme
                                )
                              }
                            >

                              Update

                            </button>

                          </td>

                        </tr>

                      )
                    )}


                    {!filteredStudents.length && (

                      <EmptyRow
                        theme={theme}
                        colSpan={
                          6
                        }
                        text="No students found."
                      />

                    )}

                  </tbody>

                </table>

              </TableWrap>

            </section>


            {/* =============================================
                FEE MANAGEMENT
            ============================================= */}

            <section
              style={{
                ...cardStyle(theme),

                marginBottom:
                  "24px",
              }}
            >

              <SectionHeader
                theme={theme}
                title="Fee Management"
                subtitle="Manage student fees and payment status"
                button="+ Add Fee"
                onClick={
                  openAddFee
                }
              />


              <input
                value={
                  feeSearch
                }
                onChange={(event) =>
                  setFeeSearch(
                    event.target.value
                  )
                }
                placeholder="Search by student ID or name..."
                style={{
                  ...inputStyle(theme),

                  marginBottom:
                    "20px",
                }}
              />


              <div
                style={{
                  display:
                    "grid",

                  gridTemplateColumns:
                    "repeat(auto-fit,minmax(180px,1fr))",

                  gap:
                    "12px",

                  marginBottom:
                    "20px",
                }}
              >

                <SummaryCard
                  theme={theme}
                  title="Total Records"
                  value={
                    managedFees.length
                  }
                />


                <SummaryCard
                  theme={theme}
                  title="Total Fees"
                  value={`₹${totalFees.toLocaleString(
                    "en-IN"
                  )}`}
                />


                <SummaryCard
                  theme={theme}
                  title="Collected"
                  value={`₹${collectedFees.toLocaleString(
                    "en-IN"
                  )}`}
                />


                <SummaryCard
                  theme={theme}
                  title="Pending"
                  value={`₹${pendingFees.toLocaleString(
                    "en-IN"
                  )}`}
                />

              </div>


              <TableWrap>

                <table
                  style={{
                    ...tableStyle,

                    minWidth:
                      "900px",
                  }}
                >

                  <thead>

                    <tr>

                      {[
                        "Student",
                        "Academic Year",
                        "Total Fee",
                        "Paid",
                        "Pending",
                        "Status",
                        "Action",
                      ].map(
                        (heading) => (

                          <th
                            key={
                              heading
                            }
                            style={
                              thStyle(theme)
                            }
                          >

                            {heading}

                          </th>

                        )
                      )}

                    </tr>

                  </thead>


                  <tbody>

                    {filteredFees.map(
                      (fee) => (

                        <tr
                          key={`${fee.student_id}-${fee.academic_year}`}
                        >

                          <td
                            style={
                              tdStyle(theme)
                            }
                          >

                            <strong>
                              {
                                fee.student_name ||
                                "Unknown Student"
                              }
                            </strong>

                            <div
                              style={
                                mutedStyle(theme)
                              }
                            >

                              {
                                fee.student_id
                              }

                            </div>

                          </td>


                          <td
                            style={
                              tdStyle(theme)
                            }
                          >

                            {
                              fee.academic_year
                            }

                          </td>


                          <td
                            style={
                              tdStyle(theme)
                            }
                          >

                            ₹
                            {fee.total_fee.toLocaleString(
                              "en-IN"
                            )}

                          </td>


                          <td
                            style={
                              tdStyle(theme)
                            }
                          >

                            ₹
                            {fee.paid_amount.toLocaleString(
                              "en-IN"
                            )}

                          </td>


                          <td
                            style={{
                              ...tdStyle(theme),

                              fontWeight:
                                700,
                            }}
                          >

                            ₹
                            {fee.pending_amount.toLocaleString(
                              "en-IN"
                            )}

                          </td>


                          <td
                            style={
                              tdStyle(theme)
                            }
                          >

                            <FeeBadge
                              status={
                                fee.status
                              }
                            />

                          </td>


                          <td
                            style={
                              tdStyle(theme)
                            }
                          >

                            <button
                              onClick={() =>
                                openEditFee(
                                  fee
                                )
                              }
                              style={
                                secondaryButton(
                                  theme
                                )
                              }
                            >

                              Edit

                            </button>

                          </td>

                        </tr>

                      )
                    )}


                    {!filteredFees.length && (

                      <EmptyRow
                        theme={theme}
                        colSpan={
                          7
                        }
                        text="No fee records found."
                      />

                    )}

                  </tbody>

                </table>

              </TableWrap>

            </section>


            {/* =============================================
                LIVE FLEET
            ============================================= */}

            <section
              style={{
                ...cardStyle(theme),

                marginBottom:
                  "24px",
              }}
            >

              <h2
                style={
                  sectionTitle(theme)
                }
              >

                Live Fleet

              </h2>


              <div
                style={{
                  display:
                    "grid",

                  gridTemplateColumns:
                    "repeat(auto-fit,minmax(240px,1fr))",

                  gap:
                    "14px",
                }}
              >

                {buses.map(
                  (bus) => (

                    <div
                      key={
                        bus.bus_id
                      }
                      style={{
                        backgroundColor:
                          theme.cardAlt,

                        border:
                          `1px solid ${theme.border}`,

                        borderRadius:
                          "12px",

                        padding:
                          "16px",
                      }}
                    >

                      <strong
                        style={{
                          fontSize:
                            "18px",
                        }}
                      >

                        {
                          bus.bus_id
                        }

                      </strong>


                      <div
                        style={
                          mutedStyle(theme)
                        }
                      >

                        {
                          bus.bus_name ||
                          "Smart Bus"
                        }

                      </div>


                      <div
                        style={{
                          marginTop:
                            "12px",

                          fontSize:
                            "14px",
                        }}
                      >

                        Passengers:{" "}

                        <strong>

                          {
                            bus.current_passengers ??
                            0
                          }

                        </strong>

                      </div>


                      <div
                        style={{
                          marginTop:
                            "6px",

                          color:
                            theme.textSecondary,

                          fontSize:
                            "13px",
                        }}
                      >

                        Available seats:{" "}

                        {
                          bus.available_seats ??
                          bus.capacity ??
                          0
                        }

                      </div>


                      {bus.driver_name && (
                        <div
                          style={{
                            marginTop:
                              "6px",
                            color:
                              theme.textSecondary,
                            fontSize:
                              "13px",
                          }}
                        >
                          Driver:{" "}
                          {
                            bus.driver_name
                          }
                        </div>
                      )}

                      <div
                        style={{
                          marginTop: "8px",
                          paddingTop: "8px",
                          borderTop: `1px dashed ${theme.border}`,
                          fontSize: "12px",
                        }}
                      >
                        <span style={{ color: theme.textSecondary, fontWeight: 500 }}>
                          Location:{" "}
                        </span>
                        {bus.area || bus.city ? (
                          <span style={{ color: theme.text, fontWeight: 500 }}>
                            {[bus.area, bus.city, bus.state].filter(Boolean).join(", ")}
                          </span>
                        ) : bus.latitude !== undefined && bus.longitude !== undefined ? (
                          <span style={{ color: theme.text, fontFamily: "monospace" }}>
                            {Number(bus.latitude).toFixed(4)}, {Number(bus.longitude).toFixed(4)}
                          </span>
                        ) : (
                          <span style={{ color: theme.textSecondary }}>
                            Location unavailable
                          </span>
                        )}
                      </div>

                    </div>

                  )
                )}

              </div>

            </section>


            {/* =============================================
                ATTENDANCE
            ============================================= */}

            <DataSection
              theme={theme}
              title="Recent Attendance"
            >

              <TableWrap>

                <table
                  style={
                    tableStyle
                  }
                >

                  <thead>

                    <tr>

                      <th
                        style={
                          thStyle(theme)
                        }
                      >

                        Student

                      </th>

                      <th
                        style={
                          thStyle(theme)
                        }
                      >

                        Bus

                      </th>

                      <th
                        style={
                          thStyle(theme)
                        }
                      >

                        Status

                      </th>

                      <th
                        style={
                          thStyle(theme)
                        }
                      >

                        Date

                      </th>

                      <th
                        style={
                          thStyle(theme)
                        }
                      >

                        Time

                      </th>

                    </tr>

                  </thead>


                  <tbody>

                    {attendance
                      .slice(0, 10)
                      .map(
                        (
                          item,
                          index
                        ) => (

                          <tr
                            key={`${item.student_id}-${item.date}-${item.time}-${index}`}
                          >

                            <td
                              style={
                                tdStyle(theme)
                              }
                            >

                              {
                                item.name ||
                                item.student_id ||
                                "—"
                              }

                            </td>


                            <td
                              style={
                                tdStyle(theme)
                              }
                            >

                              {
                                item.bus_id ||
                                "—"
                              }

                            </td>


                            <td
                              style={
                                tdStyle(theme)
                              }
                            >

                              {
                                item.status ||
                                "—"
                              }

                            </td>


                            <td
                              style={
                                tdStyle(theme)
                              }
                            >

                              {
                                item.date ||
                                "—"
                              }

                            </td>


                            <td
                              style={
                                tdStyle(theme)
                              }
                            >

                              {
                                item.time ||
                                "—"
                              }

                            </td>

                          </tr>

                        )
                      )}


                    {!attendance.length && (

                      <EmptyRow
                        theme={theme}
                        colSpan={
                          5
                        }
                        text="No attendance records found."
                      />

                    )}

                  </tbody>

                </table>

              </TableWrap>

            </DataSection>


            {/* =============================================
                EMERGENCY LOGS
            ============================================= */}

            <DataSection
              theme={theme}
              title="Emergency Logs"
            >

              {emergencies.length ? (

                emergencies
                  .slice(0, 10)
                  .map(
                    (
                      emergency,
                      index
                    ) => (

                      <div
                        key={`${emergency.timestamp}-${index}`}
                        style={{
                          border:
                            "1px solid #7f1d1d",

                          backgroundColor:
                            darkMode
                              ? "#251113"
                              : "#fff7f7",

                          borderRadius:
                            "10px",

                          padding:
                            "14px",

                          marginBottom:
                            "10px",
                        }}
                      >

                        <strong>

                          {
                            emergency.bus_id ||
                            "Unknown Bus"
                          }

                        </strong>


                        <div
                          style={
                            mutedStyle(theme)
                          }
                        >

                          {
                            emergency.type ||
                            "Emergency"
                          }

                          {emergency.message
                            ? ` — ${emergency.message}`
                            : ""}

                        </div>


                        <div
                          style={
                            mutedStyle(theme)
                          }
                        >

                          {
                            emergency.timestamp ||
                            ""
                          }

                        </div>

                      </div>

                    )
                  )

              ) : (

                <p
                  style={
                    mutedStyle(theme)
                  }
                >

                  No emergency records.

                </p>

              )}

            </DataSection>

          </>

        )}


        {/* =================================================
            DRIVER DASHBOARD
        ================================================= */}

        {role === "DRIVER" && (

          <section
            style={
              cardStyle(theme)
            }
          >

            <h2
              style={
                sectionTitle(theme)
              }
            >

              Driver Dashboard

            </h2>


            <div
              style={{
                display:
                  "grid",

                gridTemplateColumns:
                  "repeat(auto-fit,minmax(220px,1fr))",

                gap:
                  "14px",

                marginBottom:
                  "24px",
              }}
            >

              <SummaryCard
                theme={theme}
                title="Assigned Bus"
                value={
                  assignedBus ||
                  "Not assigned"
                }
              />


              <SummaryCard
                theme={theme}
                title="Current Passengers"
                value={
                  assignedBus
                    ? (
                        buses.find(
                          (bus) =>
                            bus.bus_id ===
                            assignedBus
                        )?.current_passengers ??
                        0
                      )
                    : 0
                }
              />


              <SummaryCard
                theme={theme}
                title="Available Seats"
                value={
                  assignedBus
                    ? (
                        buses.find(
                          (bus) =>
                            bus.bus_id ===
                            assignedBus
                        )?.available_seats ??
                        0
                      )
                    : 0
                }
              />

            </div>


            <p
              style={
                mutedStyle(theme)
              }
            >

              GPS tracking for your assigned bus.

            </p>


            <div
              style={{
                marginTop:
                  "20px",
              }}
            >

              <DriverGPS busId={assignedBus} />

            </div>

          </section>

        )}


        {/* =================================================
            STUDENT DASHBOARD
        ================================================= */}

        {role === "STUDENT" && (

          <section
            style={
              cardStyle(theme)
            }
          >

            <h2
              style={
                sectionTitle(theme)
              }
            >

              Student Dashboard

            </h2>


            <p
              style={
                mutedStyle(theme)
              }
            >

              Track your assigned bus and boarding status.

            </p>


            {myBusLocation ? (

              <div
                style={{
                  marginTop:
                    "20px",

                  padding:
                    "20px",

                  backgroundColor:
                    theme.cardAlt,

                  border:
                    `1px solid ${theme.border}`,

                  borderRadius:
                    "12px",
                }}
              >

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong
                    style={{
                      fontSize:
                        "20px",
                    }}
                  >
                    {
                      myBusLocation.bus_id
                    }
                  </strong>
                  <span style={{ fontSize: "12px", padding: "3px 8px", borderRadius: "6px", backgroundColor: "#10b98122", color: "#10b981", fontWeight: 600 }}>
                    Live
                  </span>
                </div>

                <div style={{ marginTop: "14px" }}>
                  <div style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: theme.textSecondary, fontWeight: 600 }}>
                    Location:
                  </div>
                  <div style={{ marginTop: "4px", fontSize: "15px", color: theme.text, fontWeight: 500 }}>
                    {myBusLocation.area || myBusLocation.city ? (
                      <>
                        <div>{[myBusLocation.area, myBusLocation.city].filter(Boolean).join(", ")}</div>
                        <div style={{ fontSize: "13px", color: theme.textSecondary, marginTop: "2px" }}>
                          {[myBusLocation.state, myBusLocation.country].filter(Boolean).join(", ")}
                        </div>
                      </>
                    ) : (
                      <span style={{ color: theme.textSecondary }}>Location unavailable</span>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: "12px" }}>
                  <div style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: theme.textSecondary, fontWeight: 600 }}>
                    Coordinates:
                  </div>
                  <div style={{ ...mutedStyle(theme), marginTop: "4px", fontFamily: "monospace", fontSize: "13px" }}>
                    {myBusLocation.latitude !== undefined && myBusLocation.longitude !== undefined ? (
                      <>
                        <div>Latitude: {Number(myBusLocation.latitude).toFixed(6)}</div>
                        <div>Longitude: {Number(myBusLocation.longitude).toFixed(6)}</div>
                      </>
                    ) : (
                      <div>Location unavailable</div>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    ...mutedStyle(theme),
                    marginTop:
                      "10px",
                    fontSize:
                      "12px",
                  }}
                >
                  Updated:{" "}
                  {
                    myBusLocation.updated_at ||
                    myBusLocation.timestamp ||
                    "—"
                  }
                </div>

                {myBusLocation.speed !==
                  undefined && myBusLocation.speed !== null && (
                  <div
                    style={{
                      ...mutedStyle(theme),
                      marginTop:
                        "4px",
                      fontSize:
                        "12px",
                    }}
                  >
                    Speed:{" "}
                    {
                      Number(myBusLocation.speed).toFixed(1)
                    }{" "}
                    km/h
                  </div>
                )}

              </div>

            ) : (

              <div
                style={{
                  marginTop:
                    "20px",
                  padding:
                    "20px",
                  backgroundColor:
                    theme.cardAlt,
                  border:
                    `1px solid ${theme.border}`,
                  borderRadius:
                    "12px",
                  color:
                    theme.textSecondary,
                }}
              >
                Location unavailable
              </div>

            )}

          </section>

        )}

      </div>


      {/* ===================================================
          ADD / UPDATE STUDENT MODAL
      =================================================== */}

      {showStudentForm && (

        <Modal
          theme={theme}

          title={
            editingStudent
              ? "Update Student"
              : "Add Student"
          }

          onClose={() => {

            setShowStudentForm(
              false
            )

            resetStudentForm()

          }}
        >

          <FormLabel>
            Student ID
          </FormLabel>


          <input
            value={
              studentId
            }

            disabled={
              !!editingStudent
            }

            onChange={(event) =>
              setStudentId(
                event.target.value
              )
            }

            style={{
              ...inputStyle(theme),

              marginBottom:
                "16px",

              backgroundColor:
                editingStudent
                  ? theme.cardAlt
                  : theme.input,
            }}
          />


          <FormLabel>
            Name
          </FormLabel>


          <input
            value={
              studentName
            }

            onChange={(event) =>
              setStudentName(
                event.target.value
              )
            }

            style={{
              ...inputStyle(theme),

              marginBottom:
                "16px",
            }}
          />


          <FormLabel>
            Email
          </FormLabel>


          <input
            type="email"

            value={
              studentEmail
            }

            onChange={(event) =>
              setStudentEmail(
                event.target.value
              )
            }

            style={{
              ...inputStyle(theme),

              marginBottom:
                "16px",
            }}
          />


          <FormLabel>
            Phone
          </FormLabel>


          <input
            value={
              studentPhone
            }

            onChange={(event) =>
              setStudentPhone(
                event.target.value
              )
            }

            style={{
              ...inputStyle(theme),

              marginBottom:
                "16px",
            }}
          />


          <FormLabel>
            Assigned Bus
          </FormLabel>


          <select
            value={
              studentBus
            }

            onChange={(event) =>
              setStudentBus(
                event.target.value
              )
            }

            style={{
              ...inputStyle(theme),

              marginBottom:
                "20px",
            }}
          >

            <option value="">
              No bus assigned
            </option>


            {managedBuses.map(
              (bus) => (

                <option
                  key={
                    bus.bus_id
                  }

                  value={
                    bus.bus_id
                  }
                >

                  {
                    bus.bus_id
                  }

                  {" — "}

                  {
                    bus.bus_name
                  }

                </option>

              )
            )}

          </select>


          <ModalButtons
            theme={theme}

            onCancel={() => {

              setShowStudentForm(
                false
              )

              resetStudentForm()

            }}

            onSave={
              saveStudent
            }

            saveText={
              editingStudent
                ? "Update Student"
                : "Add Student"
            }
          />

        </Modal>

      )}


      {/* ===================================================
          ADD / UPDATE FEE MODAL
      =================================================== */}

      {showFeeForm && (

        <Modal
          theme={theme}

          title={
            editingFee
              ? "Update Fee"
              : "Add Fee"
          }

          onClose={() => {

            setShowFeeForm(
              false
            )

            setEditingFee(
              null
            )

          }}
        >

          <FormLabel>
            Student
          </FormLabel>


          <select
            value={
              feeStudentId
            }

            disabled={
              !!editingFee
            }

            onChange={(event) =>
              setFeeStudentId(
                event.target.value
              )
            }

            style={{
              ...inputStyle(theme),

              marginBottom:
                "16px",

              backgroundColor:
                editingFee
                  ? theme.cardAlt
                  : theme.input,
            }}
          >

            <option value="">
              Select student
            </option>


            {managedStudents.map(
              (student) => (

                <option
                  key={
                    student.student_id
                  }

                  value={
                    student.student_id
                  }
                >

                  {
                    student.student_id
                  }

                  {" — "}

                  {
                    student.name
                  }

                </option>

              )
            )}

          </select>


          <FormLabel>
            Academic Year
          </FormLabel>


          <input
            value={
              feeAcademicYear
            }

            onChange={(event) =>
              setFeeAcademicYear(
                event.target.value
              )
            }

            style={{
              ...inputStyle(theme),

              marginBottom:
                "16px",
            }}
          />


          <FormLabel>
            Total Fee
          </FormLabel>


          <input
            type="number"

            min="0"

            value={
              feeTotal
            }

            onChange={(event) =>
              setFeeTotal(
                event.target.value
              )
            }

            style={{
              ...inputStyle(theme),

              marginBottom:
                "16px",
            }}
          />


          <FormLabel>
            Paid Amount
          </FormLabel>


          <input
            type="number"

            min="0"

            value={
              feePaid
            }

            onChange={(event) =>
              setFeePaid(
                event.target.value
              )
            }

            style={{
              ...inputStyle(theme),

              marginBottom:
                "20px",
            }}
          />


          {feeTotal && (

            <div
              style={{
                backgroundColor:
                  theme.cardAlt,

                border:
                  `1px solid ${theme.border}`,

                borderRadius:
                  "10px",

                padding:
                  "14px",

                marginBottom:
                  "20px",
              }}
            >

              <div
                style={
                  rowStyle
                }
              >

                <span>
                  Total
                </span>

                <strong>

                  ₹
                  {Number(
                    feeTotal ||
                    0
                  ).toLocaleString(
                    "en-IN"
                  )}

                </strong>

              </div>


              <div
                style={
                  rowStyle
                }
              >

                <span>
                  Paid
                </span>

                <strong>

                  ₹
                  {Number(
                    feePaid ||
                    0
                  ).toLocaleString(
                    "en-IN"
                  )}

                </strong>

              </div>


              <div
                style={
                  rowStyle
                }
              >

                <span>
                  Pending
                </span>

                <strong>

                  ₹
                  {Math.max(
                    Number(
                      feeTotal ||
                      0
                    ) -
                    Number(
                      feePaid ||
                      0
                    ),
                    0
                  ).toLocaleString(
                    "en-IN"
                  )}

                </strong>

              </div>

            </div>

          )}


          <ModalButtons
            theme={theme}

            onCancel={() => {

              setShowFeeForm(
                false
              )

              setEditingFee(
                null
              )

            }}

            onSave={
              saveFee
            }

            saveText={
              editingFee
                ? "Update Fee"
                : "Save Fee"
            }
          />

        </Modal>

      )}

    </main>
  )
}


// =========================================================
// TYPES
// =========================================================

type Theme =
  typeof DARK_THEME


// =========================================================
// CARD STYLE
// =========================================================

function cardStyle(
  theme: Theme
) {

  return {

    backgroundColor:
      theme.card,

    color:
      theme.text,

    border:
      `1px solid ${theme.border}`,

    borderRadius:
      "16px",

    padding:
      "24px",

    transition:
      "background-color .25s ease, border-color .25s ease, color .25s ease",

  }
}


// =========================================================
// INPUT STYLE
// =========================================================

function inputStyle(
  theme: Theme
) {

  return {

    width:
      "100%",

    boxSizing:
      "border-box" as const,

    padding:
      "12px 14px",

    border:
      `1px solid ${theme.inputBorder}`,

    borderRadius:
      "9px",

    color:
      theme.text,

    backgroundColor:
      theme.input,

    outline:
      "none",

    fontSize:
      "14px",

    transition:
      "all .2s ease",

  }
}


// =========================================================
// PRIMARY BUTTON
// =========================================================

function primaryButton(
  theme: Theme
) {

  return {

    backgroundColor:
      theme.button,

    color:
      theme.buttonText,

    border:
      "none",

    borderRadius:
      "9px",

    padding:
      "10px 16px",

    cursor:
      "pointer",

    fontWeight:
      700,

    transition:
      "all .2s ease",

  }
}


// =========================================================
// SECONDARY BUTTON
// =========================================================

function secondaryButton(
  theme: Theme
) {

  return {

    backgroundColor:
      theme.buttonSecondary,

    color:
      theme.buttonSecondaryText,

    border:
      `1px solid ${theme.border}`,

    borderRadius:
      "9px",

    padding:
      "8px 12px",

    cursor:
      "pointer",

    fontWeight:
      700,

    transition:
      "all .2s ease",

  }
}


// =========================================================
// MUTED
// =========================================================

function mutedStyle(
  theme: Theme
) {

  return {

    color:
      theme.textSecondary,

    fontSize:
      "13px",

    marginTop:
      "4px",

  }
}


// =========================================================
// SECTION TITLE
// =========================================================

function sectionTitle(
  theme: Theme
) {

  return {

    margin:
      "0 0 18px",

    fontSize:
      "22px",

    fontWeight:
      700,

    color:
      theme.text,

  }
}


// =========================================================
// ROW STYLE
// =========================================================

const rowStyle = {

  display:
    "flex",

  justifyContent:
    "space-between",

  marginBottom:
    "8px",

}


// =========================================================
// TABLE
// =========================================================

const tableStyle = {

  width:
    "100%",

  borderCollapse:
    "collapse" as const,

}


// =========================================================
// TABLE HEADER
// =========================================================

function thStyle(
  theme: Theme
) {

  return {

    padding:
      "13px 12px",

    textAlign:
      "left" as const,

    borderBottom:
      `1px solid ${theme.tableBorder}`,

    color:
      theme.text,

    fontSize:
      "13px",

    fontWeight:
      800,

  }
}


// =========================================================
// TABLE DATA
// =========================================================

function tdStyle(
  theme: Theme
) {

  return {

    padding:
      "14px 12px",

    borderBottom:
      `1px solid ${theme.tableBorder}`,

    color:
      theme.text,

    fontSize:
      "14px",

  }
}


// =========================================================
// SUMMARY CARD
// =========================================================

function SummaryCard({
  theme,
  title,
  value,
}: {
  theme: Theme
  title: string
  value: string | number
}) {

  return (

    <div
      style={{
        ...cardStyle(theme),

        padding:
          "19px",
      }}
    >

      <div
        style={{
          color:
            theme.textSecondary,

          fontSize:
            "13px",

          fontWeight:
            600,
        }}
      >

        {title}

      </div>


      <div
        style={{
          fontSize:
            "28px",

          fontWeight:
            800,

          marginTop:
            "7px",

          letterSpacing:
            "-0.5px",
        }}
      >

        {value}

      </div>

    </div>

  )
}


// =========================================================
// SECTION HEADER
// =========================================================

function SectionHeader({
  theme,
  title,
  subtitle,
  button,
  onClick,
}: {
  theme: Theme
  title: string
  subtitle: string
  button: string
  onClick: () => void
}) {

  return (

    <div
      style={{
        display:
          "flex",

        justifyContent:
          "space-between",

        alignItems:
          "center",

        gap:
          "16px",

        flexWrap:
          "wrap",

        marginBottom:
          "20px",
      }}
    >

      <div>

        <h2
          style={{
            margin:
              0,

            fontSize:
              "22px",

            fontWeight:
              700,
          }}
        >

          {title}

        </h2>


        <p
          style={{
            ...mutedStyle(theme),

            margin:
              "6px 0 0",
          }}
        >

          {subtitle}

        </p>

      </div>


      <button
        onClick={
          onClick
        }

        style={
          primaryButton(theme)
        }
      >

        {button}

      </button>

    </div>

  )
}


// =========================================================
// TABLE WRAPPER
// =========================================================

function TableWrap({
  children,
}: {
  children: ReactNode
}) {

  return (

    <div
      style={{
        overflowX:
          "auto",
      }}
    >

      {children}

    </div>

  )
}


// =========================================================
// EMPTY ROW
// =========================================================

function EmptyRow({
  theme,
  colSpan,
  text,
}: {
  theme: Theme
  colSpan: number
  text: string
}) {

  return (

    <tr>

      <td
        colSpan={
          colSpan
        }

        style={{
          padding:
            "40px",

          textAlign:
            "center",

          color:
            theme.textSecondary,
        }}
      >

        {text}

      </td>

    </tr>

  )
}


// =========================================================
// STATUS BADGE
// =========================================================

function StatusBadge({
  label,
}: {
  label: string
}) {

  const boarded =
    label ===
    "BOARDED"


  return (

    <span
      style={{
        display:
          "inline-block",

        padding:
          "5px 10px",

        borderRadius:
          "999px",

        fontSize:
          "11px",

        fontWeight:
          800,

        backgroundColor:
          boarded
            ? "#166534"
            : "#3f3f46",

        color:
          "#ffffff",
      }}
    >

      {label}

    </span>

  )
}


// =========================================================
// FEE BADGE
// =========================================================

function FeeBadge({
  status,
}: {
  status:
    | "PAID"
    | "PARTIAL"
    | "PENDING"
}) {

  const paid =
    status === "PAID"

  const partial =
    status === "PARTIAL"


  return (

    <span
      style={{
        display:
          "inline-block",

        padding:
          "5px 10px",

        borderRadius:
          "999px",

        fontSize:
          "11px",

        fontWeight:
          800,

        backgroundColor:
          paid
            ? "#166534"
            : partial
              ? "#92400e"
              : "#991b1b",

        color:
          "#ffffff",
      }}
    >

      {status}

    </span>

  )
}


// =========================================================
// DATA SECTION
// =========================================================

function DataSection({
  theme,
  title,
  children,
}: {
  theme: Theme
  title: string
  children: ReactNode
}) {

  return (

    <section
      style={{
        ...cardStyle(theme),

        marginBottom:
          "24px",
      }}
    >

      <h2
        style={
          sectionTitle(theme)
        }
      >

        {title}

      </h2>


      {children}

    </section>

  )
}


// =========================================================
// FORM LABEL
// =========================================================

function FormLabel({
  children,
}: {
  children: ReactNode
}) {

  return (

    <label
      style={{
        display:
          "block",

        marginBottom:
          "6px",

        fontSize:
          "14px",

        fontWeight:
          700,
      }}
    >

      {children}

    </label>

  )
}


// =========================================================
// MODAL
// =========================================================

function Modal({
  theme,
  title,
  onClose,
  children,
}: {
  theme: Theme
  title: string
  onClose: () => void
  children: ReactNode
}) {

  return (

    <div
      style={{
        position:
          "fixed",

        inset:
          0,

        backgroundColor:
          "rgba(0,0,0,.70)",

        display:
          "flex",

        alignItems:
          "center",

        justifyContent:
          "center",

        padding:
          "20px",

        zIndex:
          1000,
      }}
    >

      <div
        style={{
          width:
            "100%",

          maxWidth:
            "520px",

          maxHeight:
            "90vh",

          overflowY:
            "auto",

          backgroundColor:
            theme.modal,

          color:
            theme.text,

          border:
            `1px solid ${theme.border}`,

          borderRadius:
            "16px",

          padding:
            "24px",

          boxShadow:
            "0 25px 70px rgba(0,0,0,.45)",
        }}
      >

        <div
          style={{
            display:
              "flex",

            justifyContent:
              "space-between",

            alignItems:
              "center",

            marginBottom:
              "20px",
          }}
        >

          <h2
            style={{
              margin:
                0,
            }}
          >

            {title}

          </h2>


          <button
            onClick={
              onClose
            }

            style={{
              ...secondaryButton(theme),

              padding:
                "5px 10px",

              fontSize:
                "18px",
            }}
          >

            ×

          </button>

        </div>


        {children}

      </div>

    </div>

  )
}


// =========================================================
// MODAL BUTTONS
// =========================================================

function ModalButtons({
  theme,
  onCancel,
  onSave,
  saveText,
}: {
  theme: Theme
  onCancel: () => void
  onSave: () => void
  saveText: string
}) {

  return (

    <div
      style={{
        display:
          "flex",

        justifyContent:
          "flex-end",

        gap:
          "10px",
      }}
    >

      <button
        onClick={
          onCancel
        }

        style={
          secondaryButton(theme)
        }
      >

        Cancel

      </button>


      <button
        onClick={
          onSave
        }

        style={
          primaryButton(theme)
        }
      >

        {saveText}

      </button>

    </div>

  )
}

