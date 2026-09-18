"use client"

import { FormEvent, useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { login, setAuthSession, getStoredToken, getStoredUser, getCurrentUser } from "@/lib/api"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [username, setUsername] = useState("driver1")
  const [password, setPassword] = useState("driver123")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const quickRoles = [
    { label: "Driver", user: "driver1", pass: "driver123", path: "/dashboard/driver", desc: "Bus-03 Cockpit & Face Scanner" },
    { label: "Admin", user: "admin", pass: "admin123", path: "/dashboard/admin", desc: "Full Fleet, Biometrics & Fees" },
    { label: "Student", user: "3BR23CD016", pass: "student123", path: "/dashboard/student", desc: "Deepak K (Pass & Tracking)" },
  ]

  // Check if session expired message was requested via query param
  useEffect(() => {
    const msg = searchParams.get("error") || searchParams.get("message")
    if (msg === "session_expired" || msg === "expired") {
      setError("Your session has expired. Please log in again.")
    } else if (msg === "unauthorized") {
      setError("You are not authorized to access this section.")
    }

    // Auto-redirect if already authenticated
    const token = getStoredToken()
    const storedUser = getStoredUser()
    if (token && storedUser && storedUser.role) {
      if (storedUser.role === "ADMIN") {
        router.replace("/dashboard/admin")
      } else if (storedUser.role === "DRIVER") {
        router.replace("/dashboard/driver")
      } else if (storedUser.role === "STUDENT") {
        router.replace("/dashboard/student")
      } else {
        router.replace("/dashboard")
      }
      return
    }

    if (token) {
      getCurrentUser()
        .then((user) => {
          if (user.role === "ADMIN") {
            router.replace("/dashboard/admin")
          } else if (user.role === "DRIVER") {
            router.replace("/dashboard/driver")
          } else if (user.role === "STUDENT") {
            router.replace("/dashboard/student")
          } else {
            router.replace("/dashboard")
          }
        })
        .catch(() => {
          // Token invalid, stay on login page
        })
    }
  }, [router, searchParams])

  async function handleQuickLogin(user: string, pass: string, targetPath: string) {
    if (loading) return
    setError("")
    setLoading(true)
    setUsername(user)
    setPassword(pass)

    try {
      const data = await login(user.trim(), pass)
      setAuthSession(data)
      router.replace(targetPath)
    } catch (err: any) {
      console.error("[Smart Transit] Quick login error:", err)
      const errMsg = err?.message || ""
      if (errMsg.includes("connect") || errMsg.includes("Failed to fetch") || errMsg.includes("Network")) {
        setError("Unable to connect to the server. Please try again.")
      } else {
        setError(errMsg || "Invalid username or password")
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (loading) return

    setError("")
    setLoading(true)

    try {
      const data = await login(username.trim(), password)
      setAuthSession(data)

      // Role-based redirection
      if (data.role === "ADMIN") {
        router.replace("/dashboard/admin")
      } else if (data.role === "DRIVER") {
        router.replace("/dashboard/driver")
      } else if (data.role === "STUDENT") {
        router.replace("/dashboard/student")
      } else {
        router.replace("/dashboard")
      }
    } catch (err: any) {
      console.error("[Smart Transit] Login error:", err)

      const errMsg = err?.message || ""
      if (errMsg.includes("connect") || errMsg.includes("Failed to fetch") || errMsg.includes("Network")) {
        setError("Unable to connect to the server. Please try again.")
      } else if (errMsg.includes("expired")) {
        setError("Your session has expired. Please log in again.")
      } else if (errMsg.includes("authorized")) {
        setError("You are not authorized to access this section.")
      } else {
        setError("Invalid username or password")
      }
    } finally {
      setLoading(false)
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

        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "11px", fontWeight: "bold", letterSpacing: "1px", color: "#888", marginBottom: "8px", textTransform: "uppercase" }}>
            Quick 1-Click Login
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
            {quickRoles.map((r) => (
              <button
                key={r.label}
                type="button"
                disabled={loading}
                onClick={() => handleQuickLogin(r.user, r.pass, r.path)}
                style={{
                  padding: "10px 6px",
                  background: username.toLowerCase() === r.user.toLowerCase() ? "#22c55e" : "#1a1a1a",
                  color: username.toLowerCase() === r.user.toLowerCase() ? "#000" : "#fff",
                  border: username.toLowerCase() === r.user.toLowerCase() ? "1px solid #22c55e" : "1px solid #333",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: "bold",
                  cursor: loading ? "not-allowed" : "pointer",
                  textAlign: "center",
                }}
                title={`Instant 1-click login as ${r.label}`}
              >
                {r.label} Login
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
            {quickRoles.map((r) => (
              <button
                key={`fill-${r.label}`}
                type="button"
                onClick={() => {
                  setUsername(r.user)
                  setPassword(r.pass)
                  setError("")
                }}
                style={{
                  flex: 1,
                  padding: "4px 6px",
                  background: "transparent",
                  color: "#777",
                  border: "none",
                  fontSize: "10px",
                  cursor: "pointer",
                  textAlign: "center",
                  textDecoration: "underline",
                }}
              >
                Fill {r.user}
              </button>
            ))}
          </div>
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
              onChange={(event) => setUsername(event.target.value)}
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
              onChange={(event) => setPassword(event.target.value)}
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
                fontSize: "14px",
                fontWeight: "500",
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
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: "bold",
              opacity: loading ? 0.7 : 1,
              background: "#22c55e",
              color: "#000",
            }}
          >
            {loading ? "AUTHENTICATING..." : "LOGIN"}
          </button>
        </form>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center", color: "#888" }}>
          Loading Smart Transit Login...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}