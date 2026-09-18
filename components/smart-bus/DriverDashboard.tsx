"use client"

import { useState, useEffect } from "react"
import {
  Bus as BusIcon,
  Users,
  UserCheck,
  MapPin,
  Clock,
  Radio,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Send,
  RefreshCw,
  Phone,
  Shield,
} from "lucide-react"
import {
  recordAttendanceEvent,
  getBuses,
  getAttendance,
  getManagedStudents,
  type Bus,
  type Attendance,
  type AttendanceEventResult,
  type ManagedStudent,
} from "@/lib/api"
import DriverGPS from "./DriverGPS"
import DriverFaceRecognition from "./DriverFaceRecognition"

interface DriverDashboardProps {
  user: {
    username: string
    name?: string | null
    email?: string | null
    phone?: string | null
    assigned_bus?: string | null
    role: string
  }
}

export default function DriverDashboard({ user }: DriverDashboardProps) {
  const assignedBusId = user.assigned_bus || "BUS-01"

  const [busDetails, setBusDetails] = useState<Bus | null>(null)
  const [attendanceList, setAttendanceList] = useState<Attendance[]>([])
  const [assignedStudents, setAssignedStudents] = useState<ManagedStudent[]>([])
  const [loading, setLoading] = useState(false)

  // Terminal State
  const [studentIdInput, setStudentIdInput] = useState("")
  const [actionInput, setActionInput] = useState<"AUTO" | "BOARDED" | "EXITED" | "DENIED">("AUTO")
  const [stopInput, setStopInput] = useState("Main Campus Gate")
  const [terminalLoading, setTerminalLoading] = useState(false)
  const [terminalResult, setTerminalResult] = useState<AttendanceEventResult | null>(null)

  const loadBusData = async () => {
    setLoading(true)
    try {
      const [allBuses, allAttendance, allStudents] = await Promise.all([
        getBuses().catch(() => []),
        getAttendance().catch(() => []),
        getManagedStudents().catch(() => []),
      ])

      const found = allBuses.find((b) => b.bus_id === assignedBusId) || allBuses[0]
      if (found) setBusDetails(found)

      // Filter attendance for this bus
      const forBus = allAttendance.filter((a) => a.bus_id === assignedBusId)
      setAttendanceList(forBus)

      // Filter students assigned to this bus
      const myStudents = allStudents.filter((s) => s.assigned_bus === assignedBusId)
      setAssignedStudents(myStudents)
    } catch (err) {
      console.error("Failed to load driver data:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBusData()
  }, [assignedBusId])

  // Handle Non-QR Attendance Submission
  const handleRecordAttendance = async (studentIdToUse?: string, actionOverride?: "BOARDED" | "EXITED" | "DENIED") => {
    const targetId = (studentIdToUse || studentIdInput).trim()
    if (!targetId) {
      alert("Please specify or select a Student ID.")
      return
    }

    setTerminalLoading(true)
    setTerminalResult(null)

    const selectedAction = actionOverride || (actionInput === "AUTO" ? undefined : actionInput)

    try {
      const res = await recordAttendanceEvent(
        targetId,
        assignedBusId,
        stopInput,
        selectedAction
      )

      setTerminalResult(res)

      // Refresh bus passengers and logs immediately
      await loadBusData()

      if (!studentIdToUse) {
        setStudentIdInput("")
      }
    } catch (err: any) {
      setTerminalResult({
        success: false,
        action: "DENIED",
        student_id: targetId,
        message: err?.message || "Failed to record entry event.",
      })
    } finally {
      setTerminalLoading(false)
    }
  }

  const currentPassengers = busDetails?.current_passengers ?? 0
  const capacity = busDetails?.capacity ?? 40
  const availableSeats = Math.max(0, capacity - currentPassengers)
  const occupancyPercent = capacity > 0 ? Math.round((currentPassengers / capacity) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Driver Identity Banner */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <BusIcon className="h-8 w-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-white">
                {user.name || "Transit Driver"}
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Driver Command
              </span>
            </div>
            <p className="text-sm text-zinc-400 mt-1">
              Username: <span className="font-mono text-zinc-200 font-semibold">{user.username}</span> • Assigned Fleet Unit:{" "}
              <span className="font-bold text-emerald-400 font-mono">{assignedBusId}</span>
            </p>
          </div>
        </div>

        <button
          onClick={loadBusData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium border border-zinc-700 transition"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-amber-400" : ""}`} />
          Refresh Fleet State
        </button>
      </div>

      {/* Multi-Face Recognition Entrance Module (Up to 4 Simultaneous Faces) */}
      <DriverFaceRecognition
        busId={assignedBusId}
        currentStop={stopInput}
        currentPassengers={currentPassengers}
        capacity={capacity}
        onAttendanceUpdated={loadBusData}
      />

      {/* Grid: 1. Bus Occupancy Status, 2. Non-QR Entry Terminal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Unit Status & Occupancy Meter */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Users className="h-5 w-5 text-amber-400" />
                Bus Occupancy & Capacity Meter
              </h3>
              <span className="px-3 py-1 rounded-full text-xs font-mono font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700">
                {assignedBusId}
              </span>
            </div>

            <p className="text-xs text-zinc-400 mt-1">
              Synchronized passenger tally based on verified entry and exit events
            </p>

            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800">
                <span className="text-xs text-zinc-500 block">Onboard</span>
                <span className="text-3xl font-extrabold font-mono text-emerald-400 mt-1 block">
                  {currentPassengers}
                </span>
                <span className="text-[11px] text-zinc-500">Boarded Pax</span>
              </div>
              <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800">
                <span className="text-xs text-zinc-500 block">Max Seats</span>
                <span className="text-3xl font-extrabold font-mono text-zinc-200 mt-1 block">
                  {capacity}
                </span>
                <span className="text-[11px] text-zinc-500">Capacity</span>
              </div>
              <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800">
                <span className="text-xs text-zinc-500 block">Available</span>
                <span className="text-3xl font-extrabold font-mono text-amber-400 mt-1 block">
                  {availableSeats}
                </span>
                <span className="text-[11px] text-zinc-500">Open Seats</span>
              </div>
            </div>

            {/* Occupancy Progress Bar */}
            <div className="mt-5">
              <div className="flex justify-between text-xs text-zinc-400 mb-1.5 font-medium">
                <span>Occupancy Load</span>
                <span>{occupancyPercent}% Filled</span>
              </div>
              <div className="h-3 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    occupancyPercent > 90
                      ? "bg-rose-500"
                      : occupancyPercent > 70
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.min(100, occupancyPercent)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-zinc-800/80 text-xs text-zinc-400 flex items-center justify-between">
            <span>Route: {busDetails?.route || "Campus Shuttle Route"}</span>
            <span className="text-emerald-400 font-medium">Auto-Synced with Registry</span>
          </div>
        </div>

        {/* Non-QR Attendance & Entry Terminal */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-emerald-400" />
                Bus Entry Verification Terminal
              </h3>
              <span className="px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Non-QR Terminal
              </span>
            </div>

            <p className="text-xs text-zinc-400 mt-1">
              Verify student identity, check fee clearance, and record boarding/exit
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Student ID / Registration Number
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={studentIdInput}
                    onChange={(e) => setStudentIdInput(e.target.value)}
                    placeholder="e.g. 3BR23CD016 or STU-001"
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white placeholder-zinc-500 text-sm font-mono focus:outline-none focus:border-amber-500"
                  />
                  <select
                    value={actionInput}
                    onChange={(e: any) => setActionInput(e.target.value)}
                    className="px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs font-semibold focus:outline-none focus:border-amber-500"
                  >
                    <option value="AUTO">AUTO (Toggle)</option>
                    <option value="BOARDED">BOARDED</option>
                    <option value="EXITED">EXITED</option>
                    <option value="DENIED">DENIED</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Current Stop / Campus Terminal
                </label>
                <input
                  type="text"
                  value={stopInput}
                  onChange={(e) => setStopInput(e.target.value)}
                  placeholder="e.g. Main Gate, City Circle"
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <button
                onClick={() => handleRecordAttendance()}
                disabled={terminalLoading || !studentIdInput.trim()}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm transition shadow-lg flex items-center justify-center gap-2"
              >
                <Send className="h-4 w-4" />
                {terminalLoading ? "Verifying Transit Pass..." : "Verify & Record Attendance"}
              </button>
            </div>

            {/* Terminal Result Card */}
            {terminalResult && (
              <div
                className={`mt-4 p-4 rounded-xl border text-sm transition animate-in fade-in duration-200 ${
                  terminalResult.action === "BOARDED"
                    ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-200"
                    : terminalResult.action === "EXITED"
                    ? "bg-blue-950/40 border-blue-500/40 text-blue-200"
                    : "bg-rose-950/40 border-rose-500/40 text-rose-200"
                }`}
              >
                <div className="flex items-center gap-2 font-bold">
                  {terminalResult.action === "BOARDED" ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  ) : terminalResult.action === "EXITED" ? (
                    <Clock className="h-5 w-5 text-blue-400" />
                  ) : (
                    <XCircle className="h-5 w-5 text-rose-400" />
                  )}
                  <span>
                    {terminalResult.action}: {terminalResult.name || terminalResult.student_id}
                  </span>
                </div>
                <p className="text-xs mt-1 opacity-90">{terminalResult.message}</p>
                {terminalResult.fee_status && (
                  <div className="mt-2 text-xs font-mono">
                    Fee Status: <span className="font-bold">{terminalResult.fee_status}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-zinc-800 text-[11px] text-zinc-500">
            Automated fee status check: students with pending transport dues are flagged and denied.
          </div>
        </div>
      </div>

      {/* GPS Broadcaster Component */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
          <Radio className="h-5 w-5 text-emerald-400 animate-pulse" />
          Live GPS Telemetry Broadcaster
        </h3>
        <p className="text-xs text-zinc-400 mb-4">
          Broadcast high-accuracy GPS coordinates, speed, and heading to the transit operations center.
        </p>
        <DriverGPS busId={assignedBusId} />
      </div>

      {/* Assigned Students Roster (Quick 1-Click Boarding) */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">
              Assigned Students Roster ({assignedStudents.length})
            </h3>
            <p className="text-xs text-zinc-400">
              Students registered for this vehicle. Use quick actions to record boarding.
            </p>
          </div>
        </div>

        {assignedStudents.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-6">
            No students currently assigned to {assignedBusId}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-zinc-400 uppercase tracking-wider border-b border-zinc-800 bg-zinc-950/50">
                <tr>
                  <th className="py-3 px-4">Student ID</th>
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Dept</th>
                  <th className="py-3 px-4">Fee Clearance</th>
                  <th className="py-3 px-4">Transit Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {assignedStudents.map((st) => {
                  const isBoarded = st.is_boarded
                  const isFeePaid = st.fee_status === "PAID"

                  return (
                    <tr key={st.student_id} className="hover:bg-zinc-800/30 transition">
                      <td className="py-3 px-4 font-mono font-semibold text-white">
                        {st.student_id}
                      </td>
                      <td className="py-3 px-4">{st.name}</td>
                      <td className="py-3 px-4 text-xs text-zinc-400">{st.department || "Engineering"}</td>
                      <td className="py-3 px-4 text-xs">
                        <span
                          className={`px-2 py-0.5 rounded-full font-semibold ${
                            isFeePaid
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-rose-500/20 text-rose-400"
                          }`}
                        >
                          {st.fee_status || "PAID"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            isBoarded
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {isBoarded ? "ON BUS" : "OFF BUS"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        {!isBoarded ? (
                          <button
                            onClick={() => handleRecordAttendance(st.student_id, "BOARDED")}
                            disabled={terminalLoading}
                            className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition"
                          >
                            Board
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRecordAttendance(st.student_id, "EXITED")}
                            disabled={terminalLoading}
                            className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition"
                          >
                            Exit
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Attendance Logs for this Bus */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <h3 className="text-lg font-bold text-white mb-1">
          Recent Entry & Exit Logs ({assignedBusId})
        </h3>
        <p className="text-xs text-zinc-400 mb-4">
          Audit trail of boarding, exit, and denied attempts for this vehicle.
        </p>

        {attendanceList.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-6">
            No transit events recorded yet for this bus today.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-zinc-400 uppercase tracking-wider border-b border-zinc-800 bg-zinc-950/50">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Stop</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Fee Clearance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {attendanceList.slice(0, 10).map((log, idx) => (
                  <tr key={idx} className="hover:bg-zinc-800/30 transition">
                    <td className="py-3 px-4 font-mono text-xs">
                      {log.date} {log.time}
                    </td>
                    <td className="py-3 px-4 font-semibold text-white">
                      {log.name || log.student_id}
                    </td>
                    <td className="py-3 px-4 text-zinc-400">{log.stop || "Campus Terminal"}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          log.status === "BOARDED"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : log.status === "DENIED"
                            ? "bg-rose-500/20 text-rose-400"
                            : "bg-blue-500/20 text-blue-400"
                        }`}
                      >
                        {log.status || "BOARDED"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs font-mono">{log.fee_status || "PAID"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
