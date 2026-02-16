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
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

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
        return NextResponse.json(documents);
    } catch (error) {
        const err = error as Error;
        return NextResponse.json({
            error: "Fetch Error",
            details: err.message
        }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    console.log("[v1-docs] POST - Initiated v1.9");
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
                console.log("[v1-docs] POST - Loading pdf-parse via createRequire (v1.9)");
                const { createRequire } = await import("module");
                const require = createRequire(import.meta.url);
                const pdfModule = require("pdf-parse");

                let pdfFn: any = pdfModule;

                // Deep inspection for Vercel/Next.js bundling
                if (typeof pdfFn !== "function") {
                    console.warn("[v1-docs] POST - pdf-parse is not a function at top level");
                    if (pdfFn.default && typeof pdfFn.default === "function") {
                        pdfFn = pdfFn.default;
                    } else {
                        // Look for any function in the keys
                        const keys = Object.keys(pdfFn);
                        console.log("[v1-docs] POST - pdf-parse keys:", keys);
                        const fnKey = keys.find(k => typeof (pdfFn as any)[k] === "function");
                        if (fnKey) {
                            pdfFn = (pdfFn as any)[fnKey];
                        } else {
                            const keysStr = keys.join(", ");
                            throw new Error(`pdf-parse is not a function. Type: ${typeof pdfModule}, Keys: [${keysStr}]`);
                        }
                    }
                }

                const data = await pdfFn(buffer);
                content = data.text;
                console.log("[v1-docs] POST - PDF Extracted:", content?.length || 0);
            } catch (pError) {
                console.error("[v1-docs] POST - PDF Processing Crash:", pError);
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
        const err = error as Error;
        return NextResponse.json({
            error: "Global Upload Error",
            details: err.message
        }, { status: 500 });
    }
}
