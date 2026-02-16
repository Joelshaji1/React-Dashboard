import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
    return NextResponse.json({
        status: "ok",
        message: "pong",
        timestamp: new Date().toISOString(),
        version: "v1.2-Ping"
    });
}
