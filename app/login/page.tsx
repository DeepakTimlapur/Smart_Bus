"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"

const API_URL = ""
const LOGIN_TIMEOUT = 10000

export default function LoginPage() {
  const router = useRouter()

  const [username, setUsername] = useState("admin")
  const [password, setPassword] = useState("admin123")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const quickRoles = [
    { label: "Admin", user: "admin", pass: "admin123", desc: "Full Fleet, Attendance & Fees" },
    { label: "Driver", user: "driver1", pass: "driver123", desc: "Bus-03 Live GPS & Routes" },
    { label: "Student", user: "3BR23CD016", pass: "student123", desc: "Deepak K (Pass & Tracking)" },
  ]

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (loading) return

    setError("")
    setLoading(true)

    console.log("[Smart Transit] Login started")

    const controller = new AbortController()

    const timeoutId = window.setTimeout(() => {
      console.log("[Smart Transit] Login request timed out")
      controller.abort()
    }, LOGIN_TIMEOUT)

    try {
      const body = new URLSearchParams()

      body.append("username", username.trim())
      body.append("password", password)

      console.log("[Smart Transit] Sending login request...")

      const response = await fetch(
        `${API_URL}/api/v1/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: body.toString(),
          signal: controller.signal,
        }
      )

      console.log(
        "[Smart Transit] Login response:",
        response.status
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Login failed"
        )
      }

      if (!data.access_token) {
        throw new Error("Server did not return an access token")
      }

      console.log(
        "[Smart Transit] Authentication successful:",
        data.username,
        data.role
      )

      localStorage.setItem(
        "smart_bus_access_token",
        data.access_token
      )

      localStorage.setItem(
        "smart_bus_user",
        JSON.stringify({
          username: data.username,
          role: data.role,
        })
      )

      console.log("[Smart Transit] Redirecting to dashboard...")

      router.replace("/dashboard")
    } catch (err) {
      console.error("[Smart Transit] Login error:", err)

      if (err instanceof DOMException && err.name === "AbortError") {
        setError(
          "Login request timed out. Please make sure the FastAPI backend is running."
        )
      } else if (err instanceof TypeError) {
        setError(
          "Cannot connect to the backend. Make sure FastAPI is running on port 8000."
        )
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Login failed"
        )
      }
    } finally {
      window.clearTimeout(timeoutId)
      setLoading(false)

      console.log("[Smart Transit] Login process finished")
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#080808",
        color: "#f4f1ea",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "440px",
        }}
      >
        <h1
          style={{
            fontSize: "48px",
            marginBottom: "8px",
          }}
        >
          SMART TRANSIT
        </h1>

        <p
          style={{
            opacity: 0.6,
            marginBottom: "32px",
          }}
        >
          CONTROL CENTER LOGIN
        </p>

        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          {quickRoles.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => {
                setUsername(r.user)
                setPassword(r.pass)
              }}
              style={{
                flex: 1,
                padding: "8px 10px",
                background: username === r.user ? "#22c55e" : "#1a1a1a",
                color: username === r.user ? "#000" : "#ccc",
                border: "1px solid #333",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: "bold",
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>

        <form
          onSubmit={handleLogin}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "18px",
          }}
        >
          <div>
            <label>USERNAME</label>

            <input
              type="text"
              value={username}
              onChange={(event) =>
                setUsername(event.target.value)
              }
              placeholder="Enter username"
              required
              autoComplete="username"
              style={{
                display: "block",
                width: "100%",
                marginTop: "8px",
                padding: "14px",
                background: "#151515",
                color: "#fff",
                border: "1px solid #333",
              }}
            />
          </div>

          <div>
            <label>PASSWORD</label>

            <input
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              placeholder="Enter password"
              required
              autoComplete="current-password"
              style={{
                display: "block",
                width: "100%",
                marginTop: "8px",
                padding: "14px",
                background: "#151515",
                color: "#fff",
                border: "1px solid #333",
              }}
            />
          </div>

          {error && (
            <p
              style={{
                color: "#ff6b6b",
                margin: 0,
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "15px",
              border: "none",
              cursor: loading
                ? "not-allowed"
                : "pointer",
              fontWeight: "bold",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading
              ? "AUTHENTICATING..."
              : "LOGIN"}
          </button>
        </form>
      </div>
    </main>
  )
}