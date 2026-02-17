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

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const workspaceId = searchParams.get("workspaceId");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const docs = await (prisma as any).document.findMany({
            where: {
                userId: session.user.id,
                ...(workspaceId ? { workspaceId } : {})
            },
            orderBy: { createdAt: "desc" },
            select: { id: true, name: true, createdAt: true, workspaceId: true }
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

        if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
            try {
                const { createRequire } = await import("module");
                const require = createRequire(import.meta.url);
                const pdf = require("pdf-parse-fork");
                const uint8Array = new Uint8Array(buffer);
                const data = await pdf(uint8Array, {});
                content = data?.text || "";
                if (!content || content.trim().length === 0) {
                    throw new Error("No text found in PDF");
                }
            } catch (pError: any) {
                console.error("[v1-docs] PDF Error:", pError);
                return NextResponse.json({ error: "PDF Extraction Failed", details: pError.message }, { status: 500 });
            }
        } else if (file.name.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
            try {
                const { createRequire } = await import("module");
                const require = createRequire(import.meta.url);
                const mammoth = require("mammoth");
                const result = await mammoth.extractRawText({ buffer });
                content = result.value;
            } catch (mError: any) {
                return NextResponse.json({ error: "Word Extraction Failed", details: mError.message }, { status: 500 });
            }
        } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.type.includes("spreadsheetml")) {
            try {
                const { createRequire } = await import("module");
                const require = createRequire(import.meta.url);
                const XLSX = require("xlsx");
                const workbook = XLSX.read(buffer, { type: 'buffer' });
                content = workbook.SheetNames.map((name: string) => {
                    const sheet = workbook.Sheets[name];
                    return `SHEET: ${name}\n${XLSX.utils.sheet_to_txt(sheet)}`;
                }).join("\n\n");
            } catch (xError: any) {
                return NextResponse.json({ error: "Excel Extraction Failed", details: xError.message }, { status: 500 });
            }
        } else {
            content = buffer.toString("utf-8");
        }

        if (!content || content.trim().length === 0) {
            return NextResponse.json({ error: "Empty content - check file format" }, { status: 400 });
        }

        const workspaceId = formData.get("workspaceId") as string;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc = await (prisma as any).document.create({
            data: {
                name: file.name,
                content,
                userId: session.user.id,
                ...(workspaceId ? { workspaceId } : {})
            }
        });

        return NextResponse.json({ message: "Success", documentId: doc.id });
    } catch (error) {
        return NextResponse.json({ error: "Internal Error", details: (error as Error).message }, { status: 500 });
    }
}
