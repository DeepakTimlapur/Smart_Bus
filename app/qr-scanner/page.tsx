"use client"

import { useEffect, useRef, useState } from "react"
import jsQR from "jsqr"
import { scanQr } from "@/lib/api"

type ScanStatus =
  | "idle"
  | "scanning"
  | "processing"
  | "success"
  | "denied"
  | "unknown"
  | "error"

export default function QRScannerPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanningRef = useRef(false)
  const animationRef = useRef<number | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [busId, setBusId] = useState("BUS-01")
  const [stop, setStop] = useState("BITM")

  const [status, setStatus] =
    useState<ScanStatus>("idle")

  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const [studentId, setStudentId] = useState("")
  const [studentName, setStudentName] = useState("")
  const [feeStatus, setFeeStatus] = useState("")
  const [action, setAction] = useState("")

  // -----------------------------------------------
  // STOP CAMERA
  // -----------------------------------------------

  const stopCamera = () => {
    scanningRef.current = false

    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }

    if (streamRef.current) {
      streamRef.current
        .getTracks()
        .forEach((track) => track.stop())

      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  // -----------------------------------------------
  // PROCESS QR
  // -----------------------------------------------

  const processQRCode = async (
    decodedText: string
  ) => {
    const value = decodedText.trim()

    if (!value) {
      return
    }

    console.log("QR DETECTED:", value)

    setStudentId(value)
    setStatus("processing")
    setError("")

    try {
      const result = await scanQr(
        value,
        busId,
        stop.trim()
      )

      console.log("BACKEND RESULT:", result)

      setStudentId(
        result.student_id || value
      )

      setStudentName(
        result.name || ""
      )

      setFeeStatus(
        result.fee_status || ""
      )

      setAction(result.action)

      setMessage(result.message)

      if (
        result.action === "BOARDED" ||
        result.action === "EXITED"
      ) {
        setStatus("success")
      } else if (
        result.action === "DENIED"
      ) {
        setStatus("denied")
      } else {
        setStatus("unknown")
      }
    } catch (err) {
      console.error(
        "QR API ERROR:",
        err
      )

      setStatus("error")

      setError(
        err instanceof Error
          ? err.message
          : "Could not process QR code."
      )
    }
  }

  // -----------------------------------------------
  // QR DETECTION LOOP
  // -----------------------------------------------

  const scanFrame = () => {
    if (!scanningRef.current) {
      return
    }

    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas) {
      animationRef.current =
        requestAnimationFrame(scanFrame)

      return
    }

    if (
      video.readyState <
      HTMLMediaElement.HAVE_ENOUGH_DATA
    ) {
      animationRef.current =
        requestAnimationFrame(scanFrame)

      return
    }

    const context =
      canvas.getContext("2d", {
        willReadFrequently: true,
      })

    if (!context) {
      return
    }

    const width = video.videoWidth
    const height = video.videoHeight

    if (!width || !height) {
      animationRef.current =
        requestAnimationFrame(scanFrame)

      return
    }

    canvas.width = width
    canvas.height = height

    context.drawImage(
      video,
      0,
      0,
      width,
      height
    )

    const imageData =
      context.getImageData(
        0,
        0,
        width,
        height
      )

    const code = jsQR(
      imageData.data,
      imageData.width,
      imageData.height,
      {
        inversionAttempts:
          "attemptBoth",
      }
    )

    if (code) {
      console.log(
        "QR CODE FOUND:",
        code.data
      )

      scanningRef.current = false

      stopCamera()

      processQRCode(code.data)

      return
    }

    animationRef.current =
      requestAnimationFrame(scanFrame)
  }

  // -----------------------------------------------
  // START CAMERA
  // -----------------------------------------------

  const startCamera = async () => {
    setError("")
    setMessage("")
    setAction("")
    setStudentId("")
    setStudentName("")
    setFeeStatus("")
    setStatus("scanning")

    stopCamera()

    try {
      console.log(
        "REQUESTING CAMERA..."
      )

      const stream =
        await navigator.mediaDevices.getUserMedia(
          {
            video: {
              facingMode: {
                ideal: "environment",
              },

              width: {
                ideal: 1920,
              },

              height: {
                ideal: 1080,
              },

              frameRate: {
                ideal: 30,
              },
            },

            audio: false,
          }
        )

      streamRef.current = stream

      const video = videoRef.current

      if (!video) {
        throw new Error(
          "Camera video element not available."
        )
      }

      video.srcObject = stream

      video.setAttribute(
        "playsinline",
        "true"
      )

      video.muted = true

      await video.play()

      console.log(
        "CAMERA STREAM STARTED"
      )

      console.log(
        "VIDEO SIZE:",
        video.videoWidth,
        video.videoHeight
      )

      scanningRef.current = true

      scanFrame()
    } catch (err) {
      console.error(
        "CAMERA ERROR:",
        err
      )

      stopCamera()

      setStatus("error")

      if (
        err instanceof DOMException &&
        err.name === "NotAllowedError"
      ) {
        setError(
          "Camera permission was denied. Allow camera access in Chrome and try again."
        )
      } else if (
        err instanceof DOMException &&
        err.name === "NotFoundError"
      ) {
        setError(
          "No camera was found on this device."
        )
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Could not start the camera."
        )
      }
    }
  }

  // -----------------------------------------------
  // UPLOAD QR IMAGE
  // -----------------------------------------------

  const scanImage = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file =
      event.target.files?.[0]

    if (!file) {
      return
    }

    stopCamera()

    setError("")
    setMessage("")
    setAction("")
    setStatus("processing")

    try {
      const image =
        new Image()

      const imageUrl =
        URL.createObjectURL(file)

      image.src = imageUrl

      await new Promise<void>(
        (resolve, reject) => {
          image.onload = () => resolve()
          image.onerror = () =>
            reject(
              new Error(
                "Unable to load image."
              )
            )
        }
      )

      const canvas =
        canvasRef.current

      if (!canvas) {
        throw new Error(
          "Canvas unavailable."
        )
      }

      const context =
        canvas.getContext("2d", {
          willReadFrequently: true,
        })

      if (!context) {
        throw new Error(
          "Canvas context unavailable."
        )
      }

      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight

      context.drawImage(
        image,
        0,
        0
      )

      const imageData =
        context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height
        )

      const code = jsQR(
        imageData.data,
        imageData.width,
        imageData.height,
        {
          inversionAttempts:
            "attemptBoth",
        }
      )

      URL.revokeObjectURL(imageUrl)

      if (!code) {
        throw new Error(
          "No QR code found in the selected image."
        )
      }

      console.log(
        "QR FROM IMAGE:",
        code.data
      )

      await processQRCode(
        code.data
      )
    } catch (err) {
      console.error(
        "IMAGE QR ERROR:",
        err
      )

      setStatus("error")

      setError(
        err instanceof Error
          ? err.message
          : "Could not read the QR image."
      )
    }

    event.target.value = ""
  }

  // -----------------------------------------------
  // RESET
  // -----------------------------------------------

  const resetScanner = () => {
    stopCamera()

    setStatus("idle")
    setMessage("")
    setError("")
    setStudentId("")
    setStudentName("")
    setFeeStatus("")
    setAction("")
  }

  // -----------------------------------------------
  // CLEANUP
  // -----------------------------------------------

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [])

  // -----------------------------------------------
  // UI
  // -----------------------------------------------

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">

      <div className="mx-auto max-w-6xl">

        {/* HEADER */}

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">

          <div>

            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-400">
              Smart Transit / Operations
            </p>

            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              QR Boarding Scanner
            </h1>

            <p className="mt-2 max-w-xl text-sm text-zinc-400">
              Scan a registered student QR code to
              record boarding or exit activity.
            </p>

          </div>

          <a
            href="/console"
            className="w-fit rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm text-zinc-300 hover:text-white"
          >
            ← Back to Console
          </a>

        </div>

        {/* CONFIGURATION */}

        <section className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">

          <h2 className="mb-4 text-sm font-semibold">
            Scanner Configuration
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">

            <div>

              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Bus
              </label>

              <select
                value={busId}
                onChange={(e) =>
                  setBusId(e.target.value)
                }
                className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-3 text-sm text-white outline-none focus:border-emerald-500"
              >
                {Array.from(
                  { length: 25 },
                  (_, index) => {
                    const id =
                      `BUS-${String(
                        index + 1
                      ).padStart(2, "0")}`

                    return (
                      <option
                        key={id}
                        value={id}
                      >
                        {id}
                      </option>
                    )
                  }
                )}
              </select>

            </div>

            <div>

              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Stop
              </label>

              <input
                value={stop}
                onChange={(e) =>
                  setStop(e.target.value)
                }
                placeholder="Enter stop"
                className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-emerald-500"
              />

            </div>

          </div>

        </section>

        <div className="grid gap-6 lg:grid-cols-2">

          {/* CAMERA */}

          <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">

            <div className="border-b border-zinc-800 px-5 py-4">

              <div className="flex items-center justify-between">

                <div>

                  <h2 className="font-semibold">
                    Live Camera
                  </h2>

                  <p className="mt-1 text-xs text-zinc-500">
                    Position the QR code inside the
                    frame.
                  </p>

                </div>

                <span
                  className={`rounded-full px-3 py-1 text-[10px] font-bold tracking-wider ${
                    status === "scanning"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : status === "error"
                        ? "bg-red-500/10 text-red-400"
                        : "bg-zinc-900 text-zinc-400"
                  }`}
                >
                  {status.toUpperCase()}
                </span>

              </div>

            </div>

            <div className="p-5">

              {/* VIDEO */}

              <div className="relative overflow-hidden rounded-xl border border-zinc-800 bg-black">

                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className={`h-[420px] w-full object-cover ${
                    status === "scanning"
                      ? "block"
                      : "hidden"
                  }`}
                />

                <canvas
                  ref={canvasRef}
                  className="hidden"
                />

                {status === "idle" && (
                  <div className="flex h-[420px] flex-col items-center justify-center text-center">

                    <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950">

                      <svg
                        className="h-8 w-8 text-zinc-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.5"
                          d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"
                        />
                      </svg>

                    </div>

                    <p className="text-sm text-zinc-400">
                      Camera scanner ready
                    </p>

                    <p className="mt-2 text-xs text-zinc-600">
                      Click Start Camera Scanner.
                    </p>

                  </div>
                )}

                {status === "processing" && (
                  <div className="flex h-[420px] items-center justify-center">

                    <div className="text-center">

                      <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />

                      <p className="text-sm text-zinc-300">
                        Processing QR code...
                      </p>

                    </div>

                  </div>
                )}

              </div>

              {/* BUTTONS */}

              <div className="mt-5 grid gap-3 sm:grid-cols-2">

                {status !== "scanning" &&
                  status !== "processing" && (
                    <button
                      onClick={startCamera}
                      className="rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400"
                    >
                      Start Camera Scanner
                    </button>
                  )}

                {status === "scanning" && (
                  <button
                    onClick={stopCamera}
                    className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-400 hover:bg-red-500/20"
                  >
                    Stop Camera
                  </button>
                )}

                <button
                  onClick={() =>
                    fileInputRef.current?.click()
                  }
                  className="rounded-lg border border-zinc-800 px-4 py-3 text-sm font-medium text-zinc-300 hover:border-zinc-700 hover:text-white"
                >
                  Upload QR Image
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={scanImage}
                  className="hidden"
                />

              </div>

              {error && (
                <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/5 p-4">

                  <p className="text-sm text-red-400">
                    {error}
                  </p>

                </div>
              )}

            </div>
          </section>

          {/* RESULT */}

          <section className="rounded-2xl border border-zinc-800 bg-zinc-950">

            <div className="border-b border-zinc-800 px-5 py-4">

              <h2 className="font-semibold">
                Scan Result
              </h2>

              <p className="mt-1 text-xs text-zinc-500">
                Latest QR transaction
              </p>

            </div>

            <div className="p-5">

              {(status === "idle" ||
                status === "scanning") && (
                <div className="flex min-h-[420px] items-center justify-center text-center">

                  <div>

                    <div className="mx-auto mb-4 h-3 w-3 animate-pulse rounded-full bg-emerald-400" />

                    <p className="text-sm text-zinc-500">
                      {status === "scanning"
                        ? "Scanning for QR code..."
                        : "No scan yet"}
                    </p>

                    {status === "scanning" && (
                      <p className="mt-2 max-w-xs text-xs text-zinc-600">
                        Hold the QR code steady in
                        front of the camera.
                      </p>
                    )}

                  </div>

                </div>
              )}

              {status !== "idle" &&
                status !== "scanning" && (
                  <div className="space-y-5">

                    <div
                      className={`rounded-xl border p-5 ${
                        status === "success"
                          ? "border-emerald-500/20 bg-emerald-500/5"
                          : status === "denied"
                            ? "border-red-500/20 bg-red-500/5"
                            : "border-yellow-500/20 bg-yellow-500/5"
                      }`}
                    >

                      <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                        Transaction
                      </p>

                      <h3
                        className={`mt-2 text-2xl font-semibold ${
                          status === "success"
                            ? "text-emerald-400"
                            : status === "denied"
                              ? "text-red-400"
                              : "text-yellow-400"
                        }`}
                      >
                        {action ||
                          status.toUpperCase()}
                      </h3>

                      <p className="mt-2 text-sm text-zinc-400">
                        {message || error}
                      </p>

                    </div>

                    {studentId && (
                      <div className="space-y-4">

                        <div className="flex justify-between border-b border-zinc-900 pb-3">
                          <span className="text-xs text-zinc-500">
                            Student ID
                          </span>

                          <span className="text-sm font-medium">
                            {studentId}
                          </span>
                        </div>

                        {studentName && (
                          <div className="flex justify-between border-b border-zinc-900 pb-3">
                            <span className="text-xs text-zinc-500">
                              Name
                            </span>

                            <span className="text-sm font-medium">
                              {studentName}
                            </span>
                          </div>
                        )}

                        <div className="flex justify-between border-b border-zinc-900 pb-3">
                          <span className="text-xs text-zinc-500">
                            Bus
                          </span>

                          <span className="text-sm font-medium">
                            {busId}
                          </span>
                        </div>

                        <div className="flex justify-between border-b border-zinc-900 pb-3">
                          <span className="text-xs text-zinc-500">
                            Stop
                          </span>

                          <span className="text-sm font-medium">
                            {stop || "—"}
                          </span>
                        </div>

                        {feeStatus && (
                          <div className="flex justify-between">

                            <span className="text-xs text-zinc-500">
                              Fee Status
                            </span>

                            <span
                              className={
                                feeStatus.toLowerCase() ===
                                "paid"
                                  ? "text-sm font-medium text-emerald-400"
                                  : "text-sm font-medium text-red-400"
                              }
                            >
                              {feeStatus}
                            </span>

                          </div>
                        )}

                      </div>
                    )}

                    <button
                      onClick={startCamera}
                      className="w-full rounded-lg border border-zinc-800 bg-black px-4 py-3 text-sm font-medium text-zinc-300 hover:border-zinc-700 hover:text-white"
                    >
                      Scan Another QR
                    </button>

                    <button
                      onClick={resetScanner}
                      className="w-full rounded-lg border border-zinc-900 px-4 py-3 text-sm text-zinc-500 hover:text-white"
                    >
                      Reset
                    </button>

                  </div>
                )}

            </div>
          </section>

        </div>

        {/* INFO */}

        <div className="mt-6 grid gap-4 sm:grid-cols-3">

          <div className="rounded-xl border border-zinc-900 bg-zinc-950 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
              BOARDED
            </p>

            <p className="mt-2 text-xs leading-5 text-zinc-500">
              Student is marked as currently inside
              the selected bus.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-900 bg-zinc-950 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
              EXITED
            </p>

            <p className="mt-2 text-xs leading-5 text-zinc-500">
              Student is marked as no longer inside
              the bus.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-900 bg-zinc-950 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
              DENIED
            </p>

            <p className="mt-2 text-xs leading-5 text-zinc-500">
              Boarding is rejected when the student's
              fee is due.
            </p>
          </div>

        </div>

      </div>
    </main>
  )
}