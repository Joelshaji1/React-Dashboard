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
            // Robust Video ID Extraction
            const videoIdMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
            const videoId = videoIdMatch ? videoIdMatch[1] : null;

            if (!videoId) {
                return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
            }

            console.log("Extracted Video ID:", videoId);

            try {
                // HYBRID APPROACH: Vercel vs Local
                const isVercel = process.env.VERCEL === '1';

                if (isVercel) {
                    // Production: Fetch using Node.js library directly to avoid routing conflicts
                    console.log("Environment: Vercel. Fetching transcript using YoutubeTranscript Node.js library...");

                    try {
                        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
                        const rawText = transcript.map(t => t.text).join(" ");
                        truncatedText = rawText.substring(0, 25000);
                        console.log("Successfully fetched transcript using Node.js. Length:", truncatedText.length);
                    } catch (nodeError: any) {
                        console.error("Node.js fetch failed on Vercel:", nodeError.message);
                        throw new Error(`YouTube blocked the automatic request (IP block). This often happens on cloud providers like Vercel. Please use **Manual Mode** by clicking the 'Switch to Manual' button.`);
                    }
                } else {
                    // Development: Use local Python script
                    console.log("Environment: Local/Node. Using local Python script...");
                    const projectRoot = process.cwd();
                    const scriptPath = path.join(projectRoot, "get_transcript.py");

                    console.log("Running Python script:", `python "${scriptPath}" ${videoId}`);

                    const { stdout, stderr } = await execAsync(`python "${scriptPath}" ${videoId}`);
                    if (stderr) console.log("Python script stderr:", stderr);

                    const result = JSON.parse(stdout.trim());

                    if (result.error) throw new Error(result.error);
                    if (!result.transcript) throw new Error("No transcript returned from Python script");

                    const rawText = result.transcript;
                    console.log("Transcript length:", rawText.length);
                    truncatedText = rawText.substring(0, 20000);
                }

            } catch (error: any) {
                console.error("Transcript error details:", error);

                const errorMessage = error.message || "Failed to fetch transcript";

                // If Python script failed, prompt manual mode
                return NextResponse.json(
                    { error: `Automatic fetch failed (${process.env.VERCEL ? 'Cloud' : 'Local'}): ${errorMessage}. Please use Manual Mode.` },
                    { status: 500 }
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

    } catch (error: any) {
        console.error("General API Error:", error);
        return NextResponse.json({ error: `Internal Server Error: ${error.message}` }, { status: 500 });
    }
}
