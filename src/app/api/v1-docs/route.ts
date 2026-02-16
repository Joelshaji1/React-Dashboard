import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** 
 * Polyfill for DOMMatrix which is missing in some Node environments but expected by pdf.js (used in forks).
 */
if (typeof globalThis.DOMMatrix === "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).DOMMatrix = class DOMMatrix {
        constructor() { }
        static fromFloat32Array() { return new DOMMatrix(); }
        static fromFloat64Array() { return new DOMMatrix(); }
    };
}

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const docs = await (prisma as any).document.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: "desc" },
            select: { id: true, name: true, createdAt: true }
        });
        return NextResponse.json(docs);
    } catch (e) {
        return NextResponse.json({ error: "Fetch failed", details: (e as Error).message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    console.log("[v1-docs] POST - v1.15 Modern Fork");
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const formData = await req.formData();
        const file = formData.get("file") as File;
        if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

        const buffer = Buffer.from(await file.arrayBuffer());
        let content = "";

        if (file.type === "application/pdf") {
            try {
                // Use the modern fork instead of the original pdf-parse
                const { createRequire } = await import("module");
                const require = createRequire(import.meta.url);
                const pdf = require("pdf-parse-fork");

                // Stable direct call
                const data = await pdf(buffer);

                content = data?.text || "";

                if (!content || content.trim().length === 0) {
                    const pages = data?.numpages || 0;
                    throw new Error(`Extraction yielded zero text. Pages detected: ${pages}. File might be a scanned image.`);
                }

                console.log("[v1-docs] PDF Success - v1.15");
            } catch (pError) {
                console.error("[v1-docs] PDF Fork Error:", pError);
                return NextResponse.json({
                    error: "PDF Extraction Failed",
                    details: (pError as Error).message,
                    v: "1.15"
                }, { status: 500 });
            }
        } else {
            content = buffer.toString("utf-8");
        }

        if (!content || content.trim().length === 0) {
            return NextResponse.json({ error: "Empty content - check file format" }, { status: 400 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc = await (prisma as any).document.create({
            data: { name: file.name, content, userId: session.user.id }
        });

        return NextResponse.json({ message: "Success", documentId: doc.id });
    } catch (error) {
        return NextResponse.json({ error: "Internal Error", details: (error as Error).message }, { status: 500 });
    }
}
