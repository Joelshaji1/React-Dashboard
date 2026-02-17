import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
});

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { workspaceId, question } = await req.json();
        if (!question || !workspaceId) {
            return NextResponse.json({ error: "Workspace ID and question are required" }, { status: 400 });
        }

        // 1. Perform Firecrawl Search
        let webContext = "";
        try {
            console.log("[Deep Search] Initializing Firecrawl for query:", question);
            const firecrawlRes = await fetch("https://api.firecrawl.dev/v1/search", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${process.env.FIRECRAWL_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    query: question,
                    limit: 3,
                    scrapeOptions: {
                        formats: ["markdown"],
                        onlyMainContent: true
                    }
                })
            });

            if (firecrawlRes.ok) {
                const searchData = await firecrawlRes.json();
                console.log("[Deep Search] Firecrawl success:", searchData.success);
                if (searchData.success && searchData.data) {
                    webContext = searchData.data.map((item: any) =>
                        `WEB SOURCE: ${item.metadata?.title || item.url}\nCONTENT:\n${item.markdown}`
                    ).join("\n\n---\n\n");
                }
            } else {
                const errorText = await firecrawlRes.text();
                console.error("[Deep Search] Firecrawl API Error:", firecrawlRes.status, errorText);
            }
        } catch (err) {
            console.error("[Deep Search] Firecrawl Fetch exception:", err);
        }

        // 2. Fetch Workspace Documents
        console.log(`[Deep Search] Fetching docs for workspace: ${workspaceId}`);
        const docs = await (prisma as any).document.findMany({
            where: { workspaceId, userId: session.user.id }
        });

        console.log(`[Deep Search] Analyzing ${docs.length} documents...`);
        const docContext = docs.map((d: any) => {
            console.log(` - Document: ${d.name} (${d.content?.length || 0} chars)`);
            return `DOCUMENT: ${d.name}\nCONTENT:\n${d.content}`;
        }).join("\n\n---\n\n");
        const docNames = docs.map((d: any) => d.name).join(", ");

        if (!docContext && !webContext) {
            return NextResponse.json({ error: "No context found (docs or web) to answer this question" }, { status: 404 });
        }

        // 3. AI Synthesis (with Robust Retries & Massive Window)
        console.log("[Deep Search] Initializing AI synthesis...");
        // Prioritize docs by putting them first and using a large buffer (250k chars)
        const combinedContext = `
DOCUMENTS CONTEXT (SEARCH THESE FIRST):
${docContext}

---\n

WEB RESEARCH CONTEXT (SUPPLEMENTAL):
${webContext}
        `.substring(0, 250000);

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
                console.log(`[Deep Search] Attempting model: ${model}`);
                const response = await openai.chat.completions.create({
                    model: model,
                    messages: [
                        {
                            role: "system",
                            content: `You are a Deep Search Intelligence AI. Your task is to analyze BOTH the uploaded documents AND web research.
                            
                            CRITICAL INSTRUCTIONS:
                            1. You MUST analyze EVERY document listed in the "Documents Available" section.
                            2. If asked to "explain all units" or similar, provide a detailed summary for EACH individual unit/document from your local files.
                            3. Use web research ONLY as supplemental information. Your primary source is the uploaded documents.
                            4. ALWAYS cite sources: [Document: filename.pdf] for local files, and [Web: website.com] for web research.
                            5. Do NOT generalize if specific details are available in the documents.
                            
                            Documents Available: ${docNames || "None uploaded yet"}`
                        },
                        {
                            role: "user",
                            content: `Question: ${question}\n\nContext:\n${combinedContext}`
                        }
                    ],
                });

                if (response.choices?.[0]?.message?.content) {
                    console.log("[Deep Search] AI synthesis complete using:", model);
                    return NextResponse.json({
                        answer: response.choices[0].message.content,
                        hasWebResults: webContext.length > 0,
                        model_used: model
                    });
                }
            } catch (e: any) {
                lastError = e;
                console.warn(`[Deep Search] Model ${model} failed:`, e.message);
                continue;
            }
        }

        throw new Error(lastError?.message || "All AI models failed to respond");

    } catch (e: any) {
        console.error("[Deep Search] Fatal Top-Level Error:", e);
        return NextResponse.json({
            error: "Deep Search failed",
            details: e.message || "Unknown error during AI synthesis",
            stack: process.env.NODE_ENV === "development" ? e.stack : undefined
        }, { status: 500 });
    }
}
