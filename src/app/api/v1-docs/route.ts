import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Polyfill for DOMMatrix which is missing in some Node environments but expected by pdf-parse's dependencies
if (typeof global.DOMMatrix === "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).DOMMatrix = class DOMMatrix {
        constructor() { }
        static fromFloat32Array() { return new DOMMatrix(); }
        static fromFloat64Array() { return new DOMMatrix(); }
    };
}

export async function GET() {
    console.log("[v1-docs] GET - Initiated");
    try {
        let session;
        try {
            session = await getServerSession(authOptions);
            console.log("[v1-docs] GET - Session retrieved:", !!session?.user);
        } catch (sessionErr) {
            console.error("[v1-docs] GET - Session check crashed:", sessionErr);
            return NextResponse.json({
                error: "Session Crash",
                details: (sessionErr as Error).message
            }, { status: 500 });
        }

        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const documents = await (prisma as any).document.findMany({
                where: { userId: session.user.id },
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    name: true,
                    createdAt: true,
                }
            });
            console.log("[v1-docs] GET - Prism Success:", documents.length);
            return NextResponse.json(documents);
        } catch (dbErr) {
            console.error("[v1-docs] GET - Prisma Database Error:", dbErr);
            return NextResponse.json({
                error: "Database Error",
                details: (dbErr as Error).message
            }, { status: 500 });
        }
    } catch (error) {
        const err = error as Error;
        console.error("[v1-docs] GET - Fatal Exception:", err);
        return NextResponse.json({
            error: "Unknown Fatal Error",
            details: err.message
        }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    console.log("[v1-docs] POST - Initiated");
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        let content = "";

        if (file.type === "application/pdf") {
            try {
                console.log("[v1-docs] POST - Attempting dynamic PDF parse");
                // Use any cast to handle both CJS/ESM structures and bypass TS build errors
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const pdfModule: any = await import("pdf-parse");
                const pdf = pdfModule.default || pdfModule;
                const data = await pdf(buffer);
                content = data.text;
                console.log("[v1-docs] POST - PDF Extracted:", content.length);
            } catch (pError) {
                console.error("[v1-docs] POST - PDF Library Error:", pError);
                return NextResponse.json({
                    error: "PDF Processing Failed",
                    details: (pError as Error).message
                }, { status: 500 });
            }
        } else if (file.type === "text/plain") {
            content = buffer.toString("utf-8");
        } else {
            return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
        }

        if (!content || content.trim().length === 0) {
            return NextResponse.json({ error: "Extraction yielded empty text" }, { status: 400 });
        }

        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const document = await (prisma as any).document.create({
                data: {
                    name: file.name,
                    content: content,
                    userId: session.user.id,
                },
            });
            console.log("[v1-docs] POST - Save Success:", document.id);
            return NextResponse.json({
                message: "Success",
                documentId: document.id,
                name: document.name
            });
        } catch (dbErr) {
            console.error("[v1-docs] POST - Prisma Save Error:", dbErr);
            return NextResponse.json({
                error: "Database Save Failed",
                details: (dbErr as Error).message
            }, { status: 500 });
        }
    } catch (error) {
        const err = error as Error;
        console.error("[v1-docs] POST - Global Handler Crash:", err);
        return NextResponse.json({
            error: "Global Upload Error",
            details: err.message
        }, { status: 500 });
    }
}
