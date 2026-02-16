import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PDFParse } from "pdf-parse";

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
            return NextResponse.json({ error: "Unsupported file type. Please upload PDF or Text files." }, { status: 400 });
        }

        if (!content || content.trim().length === 0) {
            return NextResponse.json({ error: "Could not extract text from file." }, { status: 400 });
        }

        const document = await (prisma as any).document.create({
            data: {
                name: file.name,
                content: content,
                userId: session.user.id,
            },
        });

        return NextResponse.json({
            message: "File uploaded and processed successfully",
            documentId: document.id,
            name: document.name
        });

    } catch (error: any) {
        console.error("Upload error:", error);
        return NextResponse.json({ error: error.message || "Failed to process document" }, { status: 500 });
    }
}
