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

        const { documentId, workspaceId, question } = await req.json();

        if (!question || (!documentId && !workspaceId)) {
            return NextResponse.json({ error: "Missing document/workspace ID or question" }, { status: 400 });
        }

        let context = "";
        let sourceNames = "";

        // 1. Build context with per-document logging
        if (workspaceId) {
            // Multi-document query
            const docs = await (prisma as any).document.findMany({
                where: { workspaceId, userId: session.user.id }
            });

            if (docs.length === 0) {
                return NextResponse.json({ error: "No documents found in this workspace" }, { status: 404 });
            }

            console.log(`[v1-query] Analyzing ${docs.length} documents...`);
            context = docs.map((d: any) => {
                console.log(` - Document: ${d.name} (${d.content?.length || 0} chars)`);
                return `DOCUMENT: ${d.name}\nCONTENT:\n${d.content}`;
            }).join("\n\n---\n\n");
            sourceNames = docs.map((d: any) => d.name).join(", ");
        } else {
            // Single document query (legacy support)
            const document = await (prisma as any).document.findUnique({
                where: { id: documentId },
            });

            if (!document || document.userId !== session.user.id) {
                return NextResponse.json({ error: "Document not found or forbidden" }, { status: 404 });
            }

            console.log(`[v1-query] Analyzing single document: ${document.name} (${document.content?.length || 0} chars)`);
            context = `DOCUMENT: ${document.name}\nCONTENT:\n${document.content}`;
            sourceNames = document.name;
        }

        // 2. Truncate context to fit within model limits (approx 250k chars)
        const truncatedContext = context.substring(0, 250000);
        console.log(`[v1-query] Total context size: ${context.length}, Truncated to: ${truncatedContext.length}`);

        const models = [
            "liquid/lfm-2.5-1.2b-thinking:free",
            "meta-llama/llama-3.2-3b-instruct:free",
            "google/gemma-2-9b-it:free",
            "mistralai/mistral-7b-instruct:free",
            "openrouter/auto"
        ];

        let lastError: any = null;
        for (const model of models) {
            try {
                const response = await openai.chat.completions.create({
                    model: model,
                    messages: [
                        {
                            role: "system",
                            content: `You are a Workspace Intelligence AI. Your task is to analyze the provided documents and explain them comprehensively.
                            
                            CRITICAL INSTRUCTIONS:
                            1. You MUST analyze EVERY document listed in the "Documents Available" section.
                            2. If asked to "explain all units" or similar, provide a detailed summary for EACH individual unit/document.
                            3. ALWAYS cite which document the information came from using [Source: filename.pdf].
                            4. Do NOT generalize if specific details are available in the documents.
                            
                            Documents Available: ${sourceNames}`
                        },
                        {
                            role: "user",
                            content: `Question: ${question}\n\nContext:\n${truncatedContext}`
                        }
                    ],
                });

                if (response.choices?.[0]?.message?.content) {
                    return NextResponse.json({
                        answer: response.choices[0].message.content,
                        model_used: model,
                        sources: sourceNames
                    });
                }
            } catch (e: any) {
                lastError = e;
                console.warn(`Model ${model} failed, trying next...`, e.message);
                continue;
            }
        }

        const fallbackMsg = lastError?.message || "AI services are currently busy or unreachable.";
        return NextResponse.json({ error: `AI Error: ${fallbackMsg}. Please try again in a moment.` }, { status: 503 });
    } catch (error) {
        const err = error as Error;
        console.error("POST /api/v1-query error:", err);
        return NextResponse.json({ error: err.message || "Query failed" }, { status: 500 });
    }
}
