import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PDFParse } from "pdf-parse";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
    });
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
            select: {
                id: true,
                name: true,
                createdAt: true,
            }
        });

        return NextResponse.json(documents);
    } catch (error) {
        const err = error as Error;
        console.error("GET /api/v1-docs error:", err);
        return NextResponse.json({ error: err.message || "Failed to fetch docs" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        let content = "";

        if (file.type === "application/pdf") {
            const parser = new PDFParse({ data: buffer });
            const data = await parser.getText();
            content = data.text;
        } else if (file.type === "text/plain") {
            content = buffer.toString("utf-8");
        } else {
            return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
        }

        if (!content || content.trim().length === 0) {
            return NextResponse.json({ error: "Extraction failed" }, { status: 400 });
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
        console.error("POST /api/v1-docs error:", err);
        return NextResponse.json({ error: err.message || "Upload failed" }, { status: 500 });
    }
}
