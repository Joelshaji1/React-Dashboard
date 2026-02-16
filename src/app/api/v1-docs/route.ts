import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** 
 * Polyfill for DOMMatrix which is missing in some Node environments but expected by pdf-parse's dependencies.
 * We attach to globalThis to ensure it's available in all contexts.
 */
if (typeof globalThis.DOMMatrix === "undefined") {
    console.log("[v1-docs] Polyfilling DOMMatrix");
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
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const documents = await (prisma as any).document.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: "desc" },
            select: { id: true, name: true, createdAt: true }
        });
        return NextResponse.json(documents);
    } catch (error) {
        return NextResponse.json({ error: "Fetch failed", details: (error as Error).message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    console.log("[v1-docs] POST - Initiated v1.10");
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
                console.log("[v1-docs] POST - Resolution Bridge v1.10");
                const { createRequire } = await import("module");
                const require = createRequire(import.meta.url);
                const pdfModule = require("pdf-parse");

                // Logic to handle ESM, CJS, and Class Constructor wrappers
                let pdfFn: any = pdfModule.default || pdfModule;

                const extractText = async (fn: any, buf: Buffer) => {
                    try {
                        // Attempt 1: Standard function call
                        return await fn(buf);
                    } catch (e: any) {
                        // Attempt 2: If it's a class misidentified by the bundler
                        if (e.message.includes("invocation without 'new'") || e.message.includes("constructor")) {
                            console.warn("[v1-docs] POST - Retrying with 'new' for Class constructor");
                            return await (new fn(buf));
                        }
                        throw e;
                    }
                };

                const data = await extractText(pdfFn, buffer);
                content = data.text;
                console.log("[v1-docs] POST - PDF Success, length:", content?.length || 0);
            } catch (pError) {
                console.error("[v1-docs] POST - PDF Processing Error:", pError);
                return NextResponse.json({
                    error: "PDF Processing Failed",
                    details: (pError as Error).message,
                    v: "1.10"
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const document = await (prisma as any).document.create({
            data: {
                name: file.name,
                content: content,
                userId: session.user.id,
            },
        });
        return NextResponse.json({
            message: "Success",
            documentId: document.id,
            name: document.name
        });
    } catch (error) {
        return NextResponse.json({
            error: "Global Upload Error",
            details: (error as Error).message
        }, { status: 500 });
    }
}
