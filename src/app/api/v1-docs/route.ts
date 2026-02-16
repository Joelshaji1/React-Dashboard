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
    console.log("[v1-docs] POST - v1.14 Final Bridge");
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

                // Attempt to load the library in the most compatible way
                const pdfModule = require("pdf-parse");

                // --- UNIVERSAL BRIDGE ENGINE v1.14 ---
                const findRealFunction = (mod: any): any => {
                    if (typeof mod === "function") return mod;
                    if (mod?.default && typeof mod.default === "function") return mod.default;
                    // Some versions of the library export an object with the function as the only key
                    const keys = Object.keys(mod || {});
                    for (const k of keys) {
                        if (typeof mod[k] === "function") return mod[k];
                    }
                    return null;
                };

                const pdfFn = findRealFunction(pdfModule);
                if (!pdfFn) {
                    const keys = Object.keys(pdfModule || {}).join(", ");
                    throw new Error(`Critical: Module loaded as ${typeof pdfModule} with keys: [${keys}] but no function found.`);
                }

                // Explicitly pass data to the function with error handling for constructor mismatches
                let data: any;
                try {
                    data = await pdfFn(buffer);
                } catch (e: any) {
                    if (e.message.includes("constructor") || e.message.includes("new")) {
                        console.log("[v1-docs] Retrying with constructor call");
                        data = await (new pdfFn(buffer));
                    } else {
                        throw e;
                    }
                }

                content = data?.text || "";
                const pages = data?.numpages || 0;

                // SPECIAL FALLBACK: If text is empty but pages > 0, we might need a different property
                if ((!content || content.trim().length === 0) && pages > 0) {
                    content = data?.text_original || data?.raw_text || "";
                }

                if (!content || content.trim().length === 0) {
                    const header = buffer.subarray(0, 5).toString("utf-8");
                    const keys = Object.keys(data || {}).join(", ");
                    throw new Error(`Engine stalled. Pages: ${pages}, Keys: [${keys}], Sig: ${header}. The PDF might be non-standard or image-only.`);
                }

                console.log("[v1-docs] PDF Success - v1.14");
            } catch (pError) {
                console.error("[v1-docs] PDF Crash Detail:", pError);
                return NextResponse.json({
                    error: "PDF Stabilization Error",
                    details: (pError as Error).message,
                    v: "1.14"
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
