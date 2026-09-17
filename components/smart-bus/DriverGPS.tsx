"use client"

import { useEffect, useRef, useState } from "react"
import { updateBusGPS, type GPSLocation } from "@/lib/api"

interface DriverGPSProps {
  busId: string
}

export default function DriverGPS({ busId }: DriverGPSProps) {
  const watchId = useRef<number | null>(null)

  const [tracking, setTracking] = useState(false)
  const [error, setError] = useState("")
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)

  const [location, setLocation] = useState<{
    latitude: number
    longitude: number
    speed: number | null
  } | null>(null)

  const [humanLocation, setHumanLocation] = useState<{
    area?: string
    city?: string
    state?: string
    country?: string
  } | null>(null)

  const startTracking = () => {
    setError("")

    if (!navigator.geolocation) {
      setError("GPS is not supported by this browser.")
      return
    }

    if (!busId) {
      setError("No bus is assigned to this driver.")
      return
    }

    if (watchId.current !== null) {
      return
    }

    const id = navigator.geolocation.watchPosition(
      async (position) => {
        const latitude = position.coords.latitude
        const longitude = position.coords.longitude
        const speed =
          position.coords.speed !== null && !isNaN(position.coords.speed)
            ? Math.max(0, position.coords.speed * 3.6)
            : null
        const heading =
          position.coords.heading !== null && !isNaN(position.coords.heading)
            ? position.coords.heading
            : null

        setLocation({
          latitude,
          longitude,
          speed,
        })

        try {
          const res: GPSLocation = await updateBusGPS(
            busId,
            latitude,
            longitude,
            speed,
            heading
          )

          if (res && (res.area || res.city || res.state || res.country)) {
            setHumanLocation({
              area: res.area,
              city: res.city,
              state: res.state,
              country: res.country,
            })
          }

          setLastUpdate(new Date().toLocaleTimeString())
          setTracking(true)
          setError("")
        } catch (err) {
          console.error(err)
          setError(
            err instanceof Error
              ? err.message
              : "Failed to send GPS location."
          )
        }
      },
      (positionError) => {
        setTracking(false)
        switch (positionError.code) {
          case positionError.PERMISSION_DENIED:
            setError("Location permission was denied. Please allow GPS access.")
            break
          case positionError.POSITION_UNAVAILABLE:
            setError("GPS location is currently unavailable.")
            break
          case positionError.TIMEOUT:
            setError("GPS request timed out. Retrying...")
            break
          default:
            setError("Unable to get the current GPS location.")
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 10000,
      }
    )

    watchId.current = id
    setTracking(true)
  }

  const stopTracking = () => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
    setTracking(false)
  }

  useEffect(() => {
    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current)
      }
    }
  }, [])

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-white">
            {busId || "BUS-01"}
          </h3>
          <div className="flex items-center gap-2 text-sm mt-1">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                tracking ? "bg-green-500" : "bg-zinc-600"
              }`}
            />
            <span className="text-zinc-400">
              {tracking ? "Live" : "Offline"}
            </span>
          </div>
        </div>
      </div>

      {/* Location Section */}
      <div className="mt-6 rounded-xl bg-zinc-900/80 p-4 border border-zinc-800/80">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Location:
        </p>
        {humanLocation && (humanLocation.area || humanLocation.city) ? (
          <div className="mt-2 text-sm text-zinc-100">
            <p className="font-medium text-base">
              {[humanLocation.area, humanLocation.city].filter(Boolean).join(", ")}
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">
              {[humanLocation.state, humanLocation.country].filter(Boolean).join(", ")}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-400">Location unavailable</p>
        )}
      </div>

      {/* Coordinates Section */}
      <div className="mt-4 rounded-xl bg-zinc-900/80 p-4 border border-zinc-800/80">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Coordinates:
        </p>
        {location ? (
          <div className="mt-2 font-mono text-sm text-zinc-200 space-y-1">
            <p>Latitude: {location.latitude.toFixed(6)}</p>
            <p>Longitude: {location.longitude.toFixed(6)}</p>
            {location.speed !== null && (
              <p className="text-xs text-zinc-400 font-sans mt-1">
                Speed: {location.speed.toFixed(1)} km/h
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-400">Location unavailable</p>
        )}
      </div>

      {lastUpdate && (
        <p className="mt-4 text-xs text-zinc-600">
          Last update: {lastUpdate}
        </p>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="mt-6 flex gap-3">
        {!tracking ? (
          <button
            onClick={startTracking}
            className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-zinc-200 transition"
          >
            Start Live GPS
          </button>
        ) : (
          <button
            onClick={stopTracking}
            className="rounded-lg border border-red-900 px-5 py-2.5 text-sm text-red-400 hover:bg-red-950/30 transition"
          >
            Stop GPS
          </button>
        )}
      </div>
    </div>
  )
}
