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
    console.log("[v1-docs] POST - v1.16 XRef Resilience");
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
                const { createRequire } = await import("module");
                const require = createRequire(import.meta.url);
                const pdf = require("pdf-parse-fork");

                // --- XREF RESILIENCE v1.16 ---
                // Convert to Uint8Array which is the native format for PDF.js engines
                // This sometimes heals "bad XRef" errors caused by Buffer-to-String misinterpretations
                const uint8Array = new Uint8Array(buffer);

                // Options to be more lenient if the library allows it
                const options = {
                    // pdf-parse doesn't officially document many options, 
                    // but passing an empty or standard object can sometimes reset internal states
                };

                const data = await pdf(uint8Array, options);

                content = data?.text || "";

                if (!content || content.trim().length === 0) {
                    throw new Error(`Pages: ${data?.numpages || 0}. The PDF structure is readable but yielded no text (image-only?)`);
                }

                console.log("[v1-docs] PDF Success - v1.16");
            } catch (pError: any) {
                console.error("[v1-docs] PDF Resilience Error:", pError);

                // If we get XRef error, it's a sign the PDF structure is tricky.
                // We provide the user with a specific "Repair" message.
                const isXRef = pError.message.includes("XRef") || pError.message.includes("entry");

                return NextResponse.json({
                    error: isXRef ? "PDF Structure Error (XRef)" : "PDF Extraction Failed",
                    details: pError.message + (isXRef ? ". Try saving the PDF as a 'Reduced Size PDF' or 'Optimized PDF' and re-uploading." : ""),
                    v: "1.16"
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
