"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  Camera,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Users,
  Eye,
  RefreshCw,
  Play,
  Pause,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Info,
  Clock,
  UserCheck,
} from "lucide-react"
import {
  recognizeFacesBatch,
  type FaceRecognitionItem,
  type MultiFaceRecognitionResponse,
} from "@/lib/api"
import { ClientFaceEngine, generateCanonicalFaceEmbedding } from "@/lib/face-recognition"

interface DriverFaceRecognitionProps {
  busId: string
  currentStop?: string
  currentPassengers: number
  capacity: number
  onAttendanceUpdated: () => void
}

export default function DriverFaceRecognition({
  busId,
  currentStop = "Main Campus Gate",
  currentPassengers,
  capacity,
  onAttendanceUpdated,
}: DriverFaceRecognitionProps) {
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraPaused, setCameraPaused] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [detectedCount, setDetectedCount] = useState(0)
  const [recognizedFaces, setRecognizedFaces] = useState<FaceRecognitionItem[]>([
    {
      face_index: 1,
      student_id: "Awaiting Face",
      name: "Waiting for student...",
      status: "LOW CONFIDENCE",
      confidence: 0,
      fee_status: "STANDBY",
      assigned_bus: busId,
      boarding_status: "STANDBY",
      message: "Face slot 1 ready for entrance scanning",
    },
    {
      face_index: 2,
      student_id: "Awaiting Face",
      name: "Waiting for student...",
      status: "LOW CONFIDENCE",
      confidence: 0,
      fee_status: "STANDBY",
      assigned_bus: busId,
      boarding_status: "STANDBY",
      message: "Face slot 2 ready for entrance scanning",
    },
    {
      face_index: 3,
      student_id: "Awaiting Face",
      name: "Waiting for student...",
      status: "LOW CONFIDENCE",
      confidence: 0,
      fee_status: "STANDBY",
      assigned_bus: busId,
      boarding_status: "STANDBY",
      message: "Face slot 3 ready for entrance scanning",
    },
    {
      face_index: 4,
      student_id: "Awaiting Face",
      name: "Waiting for student...",
      status: "LOW CONFIDENCE",
      confidence: 0,
      fee_status: "STANDBY",
      assigned_bus: busId,
      boarding_status: "STANDBY",
      message: "Face slot 4 ready for entrance scanning",
    },
  ])
  const [lastScanTime, setLastScanTime] = useState<string | null>(null)
  const [scanNotice, setScanNotice] = useState<string>("Ready to scan entrance")
  const [autoScanEnabled, setAutoScanEnabled] = useState(true)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const autoScanIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Clean stop of video tracks (Privacy Compliance)
  const stopCamera = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (autoScanIntervalRef.current) {
      clearInterval(autoScanIntervalRef.current)
      autoScanIntervalRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraActive(false)
    setCameraPaused(false)
    setDetectedCount(0)
  }, [])

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [stopCamera])

  // Start Camera
  const startCamera = async () => {
    setCameraError(null)
    setScanNotice("Initializing entrance camera...")

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "environment", // Face entrance door
        },
        audio: false,
      })

      streamRef.current = stream
      setCameraActive(true)
      setCameraPaused(false)

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().then(() => {
            setScanNotice("Camera active • Monitoring entrance")
            startRenderingLoop()
          }).catch((err) => {
            console.error("Video play error:", err)
          })
        }
      }, 100)
    } catch (err: any) {
      console.warn("Camera could not be started:", err)
      setCameraError(
        "Camera permission denied or camera device not found. You can use the Multi-Student Test Simulation to test simultaneous face recognition."
      )
      setCameraActive(false)
    }
  }

  // Live Canvas Rendering & Bounding Boxes
  const startRenderingLoop = () => {
    const render = () => {
      if (!videoRef.current || !canvasRef.current || videoRef.current.readyState < 2) {
        animationFrameRef.current = requestAnimationFrame(render)
        return
      }

      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext("2d")

      if (ctx) {
        canvas.width = video.videoWidth || 640
        canvas.height = video.videoHeight || 480

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        // Detect faces in frame (up to 4)
        const detections = ClientFaceEngine.detectFaces(video)
        setDetectedCount(Math.min(4, detections.length))

        // Draw bounding boxes for detected faces
        detections.slice(0, 4).forEach((det, idx) => {
          const { x, y, width, height } = det.bbox

          // Color coded: Green, Cyan, Amber, Violet
          const colors = ["#10b981", "#06b6d4", "#f59e0b", "#8b5cf6"]
          const color = colors[idx % colors.length]

          ctx.strokeStyle = color
          ctx.lineWidth = 2.5
          ctx.strokeRect(x, y, width, height)

          // Corner markers
          const corner = 12
          ctx.lineWidth = 4
          ctx.beginPath()
          ctx.moveTo(x, y + corner)
          ctx.lineTo(x, y)
          ctx.lineTo(x + corner, y)
          ctx.moveTo(x + width - corner, y)
          ctx.lineTo(x + width, y)
          ctx.lineTo(x + width, y + corner)
          ctx.moveTo(x, y + height - corner)
          ctx.lineTo(x, y + height)
          ctx.lineTo(x + corner, y + height)
          ctx.moveTo(x + width - corner, y + height)
          ctx.lineTo(x + width, y + height)
          ctx.lineTo(x + width, y + height - corner)
          ctx.stroke()

          // Badge label
          ctx.fillStyle = color
          ctx.fillRect(x, Math.max(0, y - 24), 90, 22)
          ctx.fillStyle = "#ffffff"
          ctx.font = "bold 11px sans-serif"
          ctx.fillText(`FACE ${idx + 1} [${Math.round(det.confidence * 100)}%]`, x + 6, Math.max(14, y - 8))
        })
      }

      animationFrameRef.current = requestAnimationFrame(render)
    }

    animationFrameRef.current = requestAnimationFrame(render)
  }

  // Periodic automatic scan (runs every 2 seconds when camera active & not paused)
  useEffect(() => {
    if (cameraActive && !cameraPaused && autoScanEnabled) {
      autoScanIntervalRef.current = setInterval(() => {
        if (!processing && videoRef.current && videoRef.current.readyState >= 2) {
          processCurrentFrame()
        }
      }, 2200)
    } else {
      if (autoScanIntervalRef.current) {
        clearInterval(autoScanIntervalRef.current)
        autoScanIntervalRef.current = null
      }
    }
    return () => {
      if (autoScanIntervalRef.current) {
        clearInterval(autoScanIntervalRef.current)
      }
    }
  }, [cameraActive, cameraPaused, autoScanEnabled, processing])

  // Process live frame from video element
  const processCurrentFrame = async () => {
    if (!videoRef.current || processing) return
    setProcessing(true)

    try {
      const detections = ClientFaceEngine.detectFaces(videoRef.current)

      if (detections.length === 0) {
        setScanNotice("No faces detected in frame")
        setProcessing(false)
        return
      }

      const facesToSend = detections.slice(0, 4).map((d) => ({
        embedding: d.embedding,
        bbox: d.bbox,
      }))

      const res = await recognizeFacesBatch(busId, currentStop, facesToSend)
      updateRecognitionResults(res)
    } catch (err: any) {
      console.error("Frame recognition error:", err)
      setScanNotice("Recognition error: " + (err?.detail || err?.message || "Failed to process faces"))
    } finally {
      setProcessing(false)
    }
  }

  // Update 4-card UI state with results
  const updateRecognitionResults = (res: MultiFaceRecognitionResponse) => {
    setLastScanTime(new Date().toLocaleTimeString())
    setScanNotice(res.message || `Processed ${res.count} student(s) at entrance`)

    // Fill up to 4 cards
    const updatedCards: FaceRecognitionItem[] = []

    for (let i = 0; i < 4; i++) {
      if (i < res.processed_faces.length) {
        updatedCards.push(res.processed_faces[i])
      } else {
        // Empty slot
        updatedCards.push({
          face_index: i + 1,
          student_id: "Empty Slot",
          name: "No face detected in slot",
          status: "LOW CONFIDENCE",
          confidence: 0,
          fee_status: "NONE",
          assigned_bus: busId,
          boarding_status: "STANDBY",
          message: "Ready for next passenger",
        })
      }
    }

    setRecognizedFaces(updatedCards)
    onAttendanceUpdated()
  }

  // Multi-Student Entrance Test Simulation (Tests 4 simultaneous students entering at once!)
  // Student 1: Anita Sharma (3BR23EC045 - Registered & Paid)
  // Student 2: Deepak Kumar (3BR23CD016 - CS Dept)
  // Student 3: Rahul Verma (3BR23ME012 - Registered, Pass Expired)
  // Student 4: Unregistered Person (Unknown)
  const handleSimulateMultiStudentEntrance = async () => {
    setProcessing(true)
    setScanNotice("Simulating 4 students entering the bus simultaneously...")

    try {
      const simulatedFaces = [
        // Face 1: Anita Sharma
        {
          embedding: generateCanonicalFaceEmbedding("3BR23EC045"),
          bbox: { x: 30, y: 50, width: 120, height: 160 },
        },
        // Face 2: Kiran Kumar
        {
          embedding: generateCanonicalFaceEmbedding("3BR23CS089"),
          bbox: { x: 170, y: 50, width: 120, height: 160 },
        },
        // Face 3: Rahul Verma (Fee Expired / Pending)
        {
          embedding: generateCanonicalFaceEmbedding("3BR23ME012"),
          bbox: { x: 310, y: 50, width: 120, height: 160 },
        },
        // Face 4: Unregistered Person
        {
          embedding: generateCanonicalFaceEmbedding("UNREGISTERED_PERSON_RANDOM_99"),
          bbox: { x: 450, y: 50, width: 120, height: 160 },
        },
      ]

      const res = await recognizeFacesBatch(busId, currentStop, simulatedFaces)
      updateRecognitionResults(res)
    } catch (err: any) {
      console.error("Simulation error:", err)
      setScanNotice("Simulation error: " + (err?.detail || err?.message))
    } finally {
      setProcessing(false)
    }
  }

  // Alternative simulation: Anita & Kiran (Valid 2 students)
  const handleSimulateValidPair = async () => {
    setProcessing(true)
    setScanNotice("Simulating 2 registered students entering together...")
    try {
      const simulatedFaces = [
        {
          embedding: generateCanonicalFaceEmbedding("3BR23EC045"),
          bbox: { x: 50, y: 50, width: 140, height: 180 },
        },
        {
          embedding: generateCanonicalFaceEmbedding("3BR23CS089"),
          bbox: { x: 250, y: 50, width: 140, height: 180 },
        },
      ]
      const res = await recognizeFacesBatch(busId, currentStop, simulatedFaces)
      updateRecognitionResults(res)
    } catch (err: any) {
      setScanNotice("Error: " + (err?.detail || err?.message))
    } finally {
      setProcessing(false)
    }
  }

  const isOvercapacity = currentPassengers >= capacity

  return (
    <div id="driver-face-recognition-terminal" className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 space-y-6">
      {/* Header & Status Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Eye className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-white">Multi-Face Entrance Recognition</h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Up to 4 Simultaneous Faces
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Automated bus entrance verification • Instant fee validation & passenger counter
            </p>
          </div>
        </div>

        {/* Live Passenger Count Counter */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-xs text-zinc-400 block">Bus Occupancy ({busId})</span>
            <span
              className={`text-lg font-bold font-mono ${
                isOvercapacity ? "text-rose-400 animate-pulse" : "text-emerald-400"
              }`}
            >
              {currentPassengers} / {capacity} Seats
            </span>
          </div>

          <div className="h-9 w-px bg-zinc-800" />

          {/* Camera On/Off Toggle Button */}
          {cameraActive ? (
            <div className="flex items-center gap-2">
              <button
                id="btn-toggle-pause-camera"
                onClick={() => setCameraPaused(!cameraPaused)}
                className={`p-2.5 rounded-xl border text-xs font-medium transition ${
                  cameraPaused
                    ? "bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20"
                    : "bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700"
                }`}
                title={cameraPaused ? "Resume video analysis" : "Pause video analysis"}
              >
                {cameraPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </button>
              <button
                id="btn-stop-camera"
                onClick={stopCamera}
                className="px-4 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-semibold transition"
              >
                Stop Camera
              </button>
            </div>
          ) : (
            <button
              id="btn-start-recognition-camera"
              onClick={startCamera}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-950/50 transition"
            >
              <Camera className="h-4 w-4" />
              Start Entrance Camera
            </button>
          )}
        </div>
      </div>

      {/* Overcapacity Alert Banner */}
      {isOvercapacity && (
        <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center gap-3 text-rose-300 text-xs animate-pulse">
          <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400" />
          <div>
            <span className="font-bold">Overcapacity Alert: </span>
            <span>
              Bus {busId} has reached maximum licensed seating capacity ({capacity} passengers). Please do not permit further boardings.
            </span>
          </div>
        </div>
      )}

      {/* Video Feed & Multi-Face Overlay Area */}
      {cameraActive && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-zinc-200 font-semibold">Bus Entrance Camera Feed</span>
              {cameraPaused && (
                <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Paused
                </span>
              )}
            </div>

            <div className="flex items-center gap-4 text-zinc-400 font-mono text-[11px]">
              <span>Detected: {detectedCount}/4 faces</span>
              <span>Stop: {currentStop}</span>
            </div>
          </div>

          <div className="relative mx-auto max-w-xl aspect-video rounded-xl overflow-hidden bg-black border border-zinc-800">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />

            {processing && (
              <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center gap-2 text-white text-xs font-semibold">
                <RefreshCw className="h-4 w-4 animate-spin text-emerald-400" />
                <span>Processing biometrics & verifying fee status...</span>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-400 pt-1">
            <div className="flex items-center gap-2">
              <input
                id="chk-auto-scan"
                type="checkbox"
                checked={autoScanEnabled}
                onChange={(e) => setAutoScanEnabled(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-0"
              />
              <label htmlFor="chk-auto-scan" className="text-zinc-300 cursor-pointer">
                Auto-scan every 2 seconds
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                id="btn-scan-frame-now"
                onClick={processCurrentFrame}
                disabled={processing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-medium transition"
              >
                <RefreshCw className={`h-3 w-3 ${processing ? "animate-spin text-emerald-400" : ""}`} />
                Scan Current Frame
              </button>
            </div>
          </div>
        </div>
      )}

      {cameraError && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
          <p className="font-semibold">Camera Access Note:</p>
          <p className="mt-1 text-zinc-300">{cameraError}</p>
        </div>
      )}

      {/* Entrance Multi-Student Test Simulation Bar */}
      <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
            <span>Simultaneous 4-Face Entrance Test Simulation</span>
          </div>
          <p className="text-[11px] text-zinc-400">
            Test simultaneous recognition of 4 students entering the bus together (Paid, Pending Fee, & Unregistered).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-simulate-4-faces"
            onClick={handleSimulateMultiStudentEntrance}
            disabled={processing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition"
          >
            <Users className="h-3.5 w-3.5" />
            Test 4 Entering Students
          </button>
          <button
            id="btn-simulate-2-faces"
            onClick={handleSimulateValidPair}
            disabled={processing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition"
          >
            Test 2 Students
          </button>
        </div>
      </div>

      {/* Notification banner of latest recognition status */}
      <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
        <span className="flex items-center gap-2 font-medium text-zinc-300">
          <Info className="h-3.5 w-3.5 text-emerald-400" />
          {scanNotice}
        </span>
        {lastScanTime && (
          <span className="font-mono text-zinc-500">Last scan: {lastScanTime}</span>
        )}
      </div>

      {/* 4 Recognition Result Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {recognizedFaces.map((face) => {
          const isRecognized = face.status === "RECOGNIZED"
          const isDenied = face.status === "DENIED - FEE NOT VALID"
          const isUnknown = face.status === "UNKNOWN"
          const isAlreadyBoarded = face.status === "ALREADY BOARDED"
          const isLowConfidence = face.status === "LOW CONFIDENCE"
          const isStandby = face.boarding_status === "STANDBY"

          return (
            <div
              key={face.face_index}
              id={`face-recognition-card-${face.face_index}`}
              className={`rounded-2xl border p-4 flex flex-col justify-between transition-all duration-200 ${
                isRecognized
                  ? "bg-emerald-950/20 border-emerald-500/40 shadow-lg shadow-emerald-950/20"
                  : isDenied
                  ? "bg-rose-950/20 border-rose-500/40 shadow-lg shadow-rose-950/20"
                  : isUnknown
                  ? "bg-rose-950/15 border-rose-500/30"
                  : isAlreadyBoarded
                  ? "bg-blue-950/20 border-blue-500/40"
                  : "bg-zinc-950/40 border-zinc-800"
              }`}
            >
              <div>
                {/* Slot Header */}
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                  <div className="flex items-center gap-1.5">
                    <span className="h-5 w-5 rounded-full bg-zinc-800 text-[11px] font-bold text-zinc-300 flex items-center justify-center">
                      {face.face_index}
                    </span>
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Face {face.face_index}
                    </span>
                  </div>

                  {/* Recognition Status Badge */}
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      isRecognized
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : isDenied
                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                        : isUnknown
                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                        : isAlreadyBoarded
                        ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                        : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                    }`}
                  >
                    {isStandby ? "STANDBY" : face.status}
                  </span>
                </div>

                {/* Student Identity */}
                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white truncate max-w-[170px]">
                      {face.name}
                    </span>
                    {face.confidence > 0 && (
                      <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                        {Math.round(face.confidence * 100)}%
                      </span>
                    )}
                  </div>

                  <p className="text-xs font-mono text-zinc-400">
                    ID: <span className="text-zinc-200">{face.student_id}</span>
                  </p>
                </div>

                {/* Attributes: Fee Status & Action */}
                <div className="mt-3 pt-3 border-t border-zinc-800/60 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-zinc-900/80 border border-zinc-800">
                    <span className="text-zinc-500 block">Fee Status</span>
                    <span
                      className={`font-semibold mt-0.5 block ${
                        face.fee_status === "PAID"
                          ? "text-emerald-400"
                          : face.fee_status === "PARTIAL"
                          ? "text-amber-400"
                          : face.fee_status === "PENDING"
                          ? "text-rose-400"
                          : "text-zinc-400"
                      }`}
                    >
                      {face.fee_status}
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-zinc-900/80 border border-zinc-800">
                    <span className="text-zinc-500 block">Action</span>
                    <span
                      className={`font-semibold mt-0.5 block ${
                        face.boarding_status === "BOARDED"
                          ? "text-emerald-400"
                          : face.boarding_status === "DENIED"
                          ? "text-rose-400"
                          : face.boarding_status === "Already Boarded"
                          ? "text-blue-400"
                          : "text-zinc-400"
                      }`}
                    >
                      {face.boarding_status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Message / Outcome footer */}
              <div className="mt-3 pt-3 border-t border-zinc-800/80 flex items-start gap-1.5 text-[11px]">
                {isRecognized ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                ) : isDenied ? (
                  <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />
                ) : isUnknown ? (
                  <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />
                ) : isAlreadyBoarded ? (
                  <ShieldCheck className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
                ) : (
                  <Clock className="h-3.5 w-3.5 text-zinc-500 shrink-0 mt-0.5" />
                )}
                <span className="text-zinc-400 leading-tight">{face.message}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
