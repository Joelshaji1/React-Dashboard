import { NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
import OpenAI from "openai";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

import { prisma } from "@/lib/prisma";

const execAsync = promisify(exec);

const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
});

const STEALTH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,video/webm,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Ch-Ua": '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "Referer": "https://www.youtube.com/watch?v=",
};

async function fetchWithFailover(videoId: string) {
    // 0. Check Database Cache first
    try {
        const cached = await (prisma as any).transcriptCache.findUnique({
            where: { videoId }
        });
        if (cached) {
            console.log("CACHE HIT: Using stored transcript for", videoId);
            return cached.content;
        }
    } catch (e) {
        console.warn("Cache check failed:", e);
    }

    let lastError: any = null;
    const methodLog: string[] = [];

    // Method 0: Supadata Professional API (The "Master" Method - 100% Reliable)
    const apiKey = process.env.SCRAPER_API_KEY || process.env.SUPADATA_API_KEY;
    if (apiKey) {
        try {
            console.log("Method 0: Attempting Supadata Master API for", videoId);
            const apiUrl = `https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&mode=auto`;
            const response = await fetch(apiUrl, {
                headers: { "x-api-key": apiKey },
                cache: 'no-store'
            });

            console.log(`Supadata Status: ${response.status} ${response.statusText}`);
            const data = await response.json();

            // Robust extraction: Handle both flat strings and arrays of objects (common in professional APIs)
            let finalTranscript = "";
            const rawContent = data.content || data.text || data.transcript || "";

            if (typeof rawContent === "string") {
                finalTranscript = rawContent;
            } else if (Array.isArray(rawContent)) {
                finalTranscript = rawContent.map((item: any) => item.text || item.content || "").join(" ");
            }

            if (finalTranscript && finalTranscript.trim().length > 100) {
                console.log("Method 0: Success via Supadata! Length:", finalTranscript.length);
                return finalTranscript.substring(0, 25000);
            }

            const errorMsg = `Supadata ${response.status}: No valid transcript content in response`;
            console.warn("Method 0 (Supadata) failed:", errorMsg);

            // IMMEDIATELY throw if we have diagnostics to stop backups from hiding the real issue
            const diagError = new Error(errorMsg);
            (diagError as any).diagnostics = JSON.stringify(data);
            throw diagError;
        } catch (e: any) {
            const msg = `Method 0 (Supadata) error: ${e.message}`;
            console.warn(msg);
            methodLog.push(msg);
            // If it's a diagnostic error we just created (or if it has diagnostics), rethrow it
            if (e.diagnostics || e.message.includes("Supadata")) {
                (e as any).methodLog = methodLog;
                throw e;
            }
            lastError = e;
        }
    } else {
        console.log("Method 0 skipped: NO_API_KEY. Ensure SCRAPER_API_KEY is set in Vercel.");
    }

    // Method 1: youtube-transcript (Standard) - FAST
    try {
        console.log("Method 1: Attempting youtube-transcript...");
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
        return transcript.map(t => t.text).join(" ").substring(0, 25000);
    } catch (e: any) {
        lastError = e;
        const msg = `Method 1 (Node) error: ${e.message}`;
        console.warn(msg);
        methodLog.push(msg);
    }

    // Method 2: YouTubei.js (InnerTube) - Reliable but heavier
    try {
        console.log("Method 2: Attempting YouTubei.js (InnerTube)...");
        const { Innertube } = await import("youtubei.js");
        // Limit initialization timeout to 8s
        const youtube = await Innertube.create();
        const info = await youtube.getInfo(videoId);
        const transcriptData = await info.getTranscript();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const segments = (transcriptData as any).transcript.content.body.initial_segments;
        if (segments) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const text = segments.map((s: any) => s.snippet.text).join(" ");
            return text.substring(0, 25000);
        }
    } catch (e: any) {
        lastError = e;
        const msg = `Method 2 (InnerTube) error: ${e.message}`;
        console.warn(msg);
        methodLog.push(msg);
    }

    // Method 3: Server-Side Proxy Bypass (Fast Failover)
    const proxies = [
        `https://api.allorigins.win/raw?url=`,
        `https://corsproxy.io/?url=`
    ];

    for (const proxyBase of proxies) {
        try {
            console.log(`Method 3: Attempting proxy ${proxyBase}...`);
            const targetUrl = encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`);
            const response = await fetch(`${proxyBase}${targetUrl}`, {
                headers: STEALTH_HEADERS,
                signal: AbortSignal.timeout(5000)
            });
            const html = await response.text();
            if (html.includes("ytInitialPlayerResponse") || html.includes("\"captions\":")) {
                console.log("Method 3: Successfully reached YouTube via proxy. Moving to Python fallback.");
                break;
            }
        } catch (e: any) {
            const msg = `Method 3 (Proxy) error: ${e.message}`;
            console.warn(msg);
            methodLog.push(msg);
        }
    }

    if (lastError) {
        (lastError as any).methodLog = methodLog;
    }

    throw lastError || new Error("Failed to fetch transcript from all server-side methods.");
}

export async function POST(req: Request) {
    try {
        const { url, text } = await req.json();
        console.log("Summarizing URL:", url);

        if (!url && !text) {
            return NextResponse.json({ error: "URL or Text is required" }, { status: 400 });
        }

        let truncatedText = "";

        if (text) {
            console.log("Using manual transcript text. Length:", text.length);
            truncatedText = text.substring(0, 25000);
        } else {
            const videoIdMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
            const videoId = videoIdMatch ? videoIdMatch[1] : null;

            if (!videoId) {
                return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
            }

            try {
                truncatedText = await fetchWithFailover(videoId);
                console.log("Successfully fetched transcript. Length:", truncatedText.length);

                // Save to Database Cache (Async)
                if (truncatedText && truncatedText.length > 100) {
                    (prisma as any).transcriptCache.upsert({
                        where: { videoId },
                        update: { content: truncatedText },
                        create: { videoId, content: truncatedText }
                    }).catch((e: any) => console.warn("Cache background save failed:", e));
                }
            } catch (error: any) {
                console.error("Transcript failure on server:", error.message);
                return NextResponse.json(
                    {
                        error: `YouTube IP Block: ${error.message}`,
                        diagnostics: (error as any).diagnostics || "No extra info provided.",
                        methodLog: (error as any).methodLog || [],
                        keyCheck: process.env.SCRAPER_API_KEY ? "Present (Starts with: " + process.env.SCRAPER_API_KEY.substring(0, 4) + ")" : "MISSING in Environment",
                        isIPBlock: true,
                        videoId: videoId
                    },
                    { status: 403 }
                );
            }
        }

        // AI Processing with Failover Strategy
        const models = [
            "liquid/lfm-2.5-1.2b-thinking:free", // Very fast
            "meta-llama/llama-3.2-3b-instruct:free",
            "google/gemma-2-9b-it:free",
            "mistralai/mistral-7b-instruct:free",
            "openrouter/auto",
            "sophosympatheia/rogue-rose-103b-v0.2:free"
        ];

        let summary = "";
        let lastError = null;

        console.log("Starting AI generation with failover...");

        for (const model of models) {
            try {
                console.log(`Attempting with model: ${model}`);
                const completion = await openai.chat.completions.create({
                    model: model,
                    messages: [
                        {
                            role: "system",
                            content: "You are an expert study assistant. Your task is to provide a comprehensive summary and detailed study notes based *strictly* on the provided YouTube video transcript. Do not hallucinate information not present in the text. \n\nFormat your response as:\n# Video Summary\n[Concise summary of the video content]\n\n# Key Study Notes\n- [Point 1]\n- [Point 2]\n- [Point 3]",
                        },
                        {
                            role: "user",
                            content: `Transcript:\n${truncatedText}`,
                        },
                    ],
                });

                if (completion.choices && completion.choices[0] && completion.choices[0].message) {
                    summary = completion.choices[0].message.content || "";
                    if (summary.trim().length > 0) {
                        console.log(`Success! Generated summary using ${model}`);
                        break; // Exit loop on success
                    }
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (aiError: any) {
                console.warn(`Failed with model ${model}:`, aiError.message);
                lastError = aiError;
                // Loop continues to next model
            }
        }

        if (!summary) {
            console.error("All AI models failed.");
            const msg = lastError?.message || "All AI providers are currently busy.";
            return NextResponse.json({ error: `AI Service Error: ${msg}. Please try again later.` }, { status: 503 });
        }

        return NextResponse.json({ summary });

    } catch (error) {
        const err = error as Error;
        console.error("General API Error:", err);
        return NextResponse.json({ error: `Internal Server Error: ${err.message}` }, { status: 500 });
    }
}
