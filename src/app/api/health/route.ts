import { NextResponse } from "next/server";
import { get } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = get<{ ok: number }>("SELECT 1 AS ok");
    if (!res || res.ok !== 1) {
      return NextResponse.json({ status: "error", message: "Database query failed" }, { status: 500 });
    }

    return NextResponse.json({
      status: "healthy",
      database: "connected",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  } catch (error) {
    return NextResponse.json(
      { status: "unhealthy", error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
