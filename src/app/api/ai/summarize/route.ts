import { NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
import OpenAI from "openai";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
});

const BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1"
};

async function fetchWithFailover(videoId: string) {
    let lastError: any = null;

    // Method 1: youtube-transcript (Standard) - FAST
    try {
        console.log("Method 1: Attempting youtube-transcript...");
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
        return transcript.map(t => t.text).join(" ").substring(0, 25000);
    } catch (e: any) {
        lastError = e;
        console.warn("Method 1 failed:", e.message);
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
        console.warn("Method 2 failed:", e.message);
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
                headers: BROWSER_HEADERS,
                signal: AbortSignal.timeout(5000)
            });
            const html = await response.text();
            if (html.includes("ytInitialPlayerResponse") || html.includes("\"captions\":")) {
                console.log("Method 3: Successfully reached YouTube via proxy. Moving to Python fallback.");
                break;
            }
        } catch (e: any) {
            console.warn(`Method 3 proxy failed:`, e.message);
        }
    }

    // Method 4: Python YouTubeTranscriptApi (The "Guaranteed" Fix)
    // This is much more resilient than Node libraries
    try {
        console.log("Method 4: Attempting Python youtube-transcript-api...");
        const scriptPath = path.join(process.cwd(), "get_transcript.py");
        const { stdout } = await execAsync(`python "${scriptPath}" ${videoId}`);
        const result = JSON.parse(stdout);
        if (result.transcript) {
            return result.transcript.substring(0, 25000);
        }
        if (result.error) throw new Error(result.error);
    } catch (e: any) {
        lastError = e;
        console.warn("Method 4 failed:", e.message);
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
            } catch (error: any) {
                console.error("Transcript failure on server:", error.message);
                return NextResponse.json(
                    {
                        error: `YouTube IP Block: ${error.message}`,
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
