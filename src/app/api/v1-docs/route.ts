import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** 
 * Polyfill for DOMMatrix which is missing in some Node environments but expected by pdf-parse's dependencies.
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
    console.log("[v1-docs] POST - v1.13 Buffer Verify");
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
                // --- BUFFER VERIFICATION v1.13 ---
                const bufSize = buffer.length;
                const header = buffer.subarray(0, 5).toString("utf-8"); // Should be %PDF-
                console.log(`[v1-docs] POST - Buffer Check: Size=${bufSize}, Header=${header}`);

                const { createRequire } = await import("module");
                const require = createRequire(import.meta.url);
                const pdfModule = require("pdf-parse");

                const findFunction = (obj: any, depth = 0): any => {
                    if (depth > 3) return null;
                    if (typeof obj === "function") return obj;
                    if (obj && typeof obj === "object") {
                        if (obj.default && typeof obj.default === "function") return obj.default;
                        for (const k of Object.keys(obj)) {
                            if (typeof obj[k] === "function") return obj[k];
                        }
                    }
                    return null;
                };

                const pdfFn = findFunction(pdfModule);
                if (!pdfFn) throw new Error("PDF Engine not found in module");

                const extract = async (fn: any, buf: Buffer) => {
                    try { return await fn(buf); }
                    catch (e: any) { return await (new fn(buf)); }
                };

                const data = await extract(pdfFn, buffer);

                const rawText = data?.text || "";
                const numPages = data?.numpages || 0;

                content = rawText;

                if (!content || content.trim().length === 0) {
                    const isPdf = header.includes("%PDF-");
                    throw new Error(`Extraction failed. Pages: ${numPages}, Buf: ${bufSize}, validSig: ${isPdf}. ${numPages === 0 && isPdf ? "File structure is valid but unreadable by current engine." : ""}`);
                }
            } catch (pError) {
                console.error("[v1-docs] POST - PDF Crash:", pError);
                return NextResponse.json({
                    error: "PDF Extraction Failed",
                    details: (pError as Error).message,
                    v: "1.13"
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
