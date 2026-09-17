import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({ status: "healthy", database: "connected", timestamp: new Date().toISOString() })
}
