import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: process.env.OPENROUTER_BASE_URL,
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
                // We keep going as we might have valid local docs
            }
        } catch (err) {
            console.error("[Deep Search] Firecrawl Fetch exception:", err);
        }

        // 2. Fetch Workspace Documents
        console.log("[Deep Search] Fetching docs for workspace:", workspaceId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const docs = await (prisma as any).document.findMany({
            where: { workspaceId, userId: session.user.id }
        });

        const docContext = docs.map((d: any) => `DOCUMENT: ${d.name}\nCONTENT:\n${d.content}`).join("\n\n---\n\n");
        const docNames = docs.map((d: any) => d.name).join(", ");

        if (!docContext && !webContext) {
            return NextResponse.json({ error: "No context found (docs or web) to answer this question" }, { status: 404 });
        }

        // 3. AI Synthesis
        console.log("[Deep Search] Initializing AI synthesis...");
        const combinedContext = `
DOCUMENTS CONTEXT:
${docContext}

---\n

WEB RESEARCH CONTEXT:
${webContext}
        `.substring(0, 25000); // Safety limit

        const response = await openai.chat.completions.create({
            model: "openrouter/auto",
            messages: [
                {
                    role: "system",
                    content: `You are a Deep Search AI. Use BOTH the uploaded documents and the web research provided to answer.
                    - If info comes from a document, cite [Document: filename.pdf].
                    - If info comes from the web, cite [Web: website.com].
                    - If documents and web conflict, prioritize documents but mention the conflict.
                    Documents Available: ${docNames || "None uploaded yet"}`
                },
                {
                    role: "user",
                    content: `Question: ${question}\n\nContext:\n${combinedContext}`
                }
            ],
        });

        console.log("[Deep Search] AI synthesis complete.");

        return NextResponse.json({
            answer: response.choices[0].message.content,
            hasWebResults: webContext.length > 0
        });

    } catch (e: any) {
        console.error("[Deep Search] Fatal Top-Level Error:", e);
        return NextResponse.json({
            error: "Deep Search failed",
            details: e.message || "Unknown error during AI synthesis",
            stack: process.env.NODE_ENV === "development" ? e.stack : undefined
        }, { status: 500 });
    }
}
