import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
    });
}

const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
});

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { documentId, question } = await req.json();

        if (!documentId || !question) {
            return NextResponse.json({ error: "Missing document ID or question" }, { status: 400 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const document = await (prisma as any).document.findUnique({
            where: { id: documentId },
        });

        if (!document) {
            return NextResponse.json({ error: "Document not found" }, { status: 404 });
        }

        if (document.userId !== session.user.id) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const context = document.content.substring(0, 15000);

        const response = await openai.chat.completions.create({
            model: "meta-llama/llama-3-8b-instruct:free",
            messages: [
                {
                    role: "system",
                    content: "Answer the question based ONLY on the provided document. If unsure, say you don't know."
                },
                {
                    role: "user",
                    content: `Document:\n${context}\n\nQuestion: ${question}`
                }
            ],
        });

        return NextResponse.json({
            answer: response.choices[0].message.content
        });
    } catch (error) {
        const err = error as Error;
        console.error("Query error:", err);
        return NextResponse.json({ error: err.message || "Failed to query document" }, { status: 500 });
    }
}
