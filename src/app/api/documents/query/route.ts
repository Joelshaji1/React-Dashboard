import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
});

export async function GET() {
    return NextResponse.json({ error: "Method Not Allowed. Use POST." }, { status: 405 });
}

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

        const document = await (prisma as any).document.findUnique({
            where: { id: documentId },
        });

        if (!document) {
            return NextResponse.json({ error: "Document not found" }, { status: 404 });
        }

        if (document.userId !== session.user.id) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Simple RAG logic: Truncate content to fit in context window
        // In a real app, we'd use vector embeddings and a vector DB.
        const context = document.content.substring(0, 15000); // ~4k-5k tokens

        const response = await openai.chat.completions.create({
            model: "meta-llama/llama-3-8b-instruct:free", // Using a free model
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant. Answer the user's question based ONLY on the provided document content. If the answer is not in the document, say you don't know."
                },
                {
                    role: "user",
                    content: `Document Content:\n${context}\n\nQuestion: ${question}`
                }
            ],
        });

        return NextResponse.json({
            answer: response.choices[0].message.content
        });

    } catch (error: any) {
        console.error("Query error:", error);
        return NextResponse.json({ error: error.message || "Failed to query document" }, { status: 500 });
    }
}
