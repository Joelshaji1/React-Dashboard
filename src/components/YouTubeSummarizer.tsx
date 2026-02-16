"use client";

import { useState } from "react";
import { Loader2, Play, FileText, CheckCircle, FileEdit, Link, AlertCircle } from "lucide-react";

export default function YouTubeSummarizer() {
    const [mode, setMode] = useState<"url" | "manual">("url");

    // URL Mode State
    const [url, setUrl] = useState("");

    // Manual Mode State
    const [manualText, setManualText] = useState("");

    const [summary, setSummary] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const fetchTranscriptClient = async (videoId: string) => {
        try {
            // We use a simple fetch to a reliable third-party mirror or direct fetch if possible
            // Since direct fetch to YouTube is CORS-blocked, we try a proxy or a known open endpoint
            // For this specific fix, we'll try to fetch from a public mirror if the server fails
            const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`);
            const data = await res.json();
            const html = data.contents;

            // Basic extraction logic from the HTML page (captions JSON)
            const captionsMatch = html.match(/"captions":(\{.*?\})/);
            if (!captionsMatch) throw new Error("No captions found in video metadata");

            const captions = JSON.parse(captionsMatch[1]);
            const baseUrl = captions.playerCaptionsTracklistRenderer.captionTracks[0].baseUrl;

            const transcriptRes = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(baseUrl)}`);
            const transcriptData = await transcriptRes.json();
            const xml = transcriptData.contents;

            // Parse XML text content
            const textNodes = xml.match(/<text.*?>([\s\S]*?)<\/text>/g);
            if (!textNodes) throw new Error("Could not parse transcript XML");

            return textNodes.map((node: string) => {
                return node.replace(/<text.*?>/, "").replace(/<\/text>/, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
            }).join(" ");
        } catch (e) {
            console.error("Client-side fetch failed:", e);
            throw new Error("Could not fetch transcript even from browser. Please use Manual Mode.");
        }
    };

    const handleSummarize = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        setSummary("");

        try {
            let res = await fetch("/api/ai/summarize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: mode === "url" ? url : undefined,
                    text: mode === "manual" ? manualText : undefined
                }),
            });

            let data = await res.json();

            // Check for IP Block and attempt Client-Side Failover
            if (res.status === 403 && data.isIPBlock && mode === "url") {
                console.log("Server IP Block detected. Attempting client-side extraction...");
                try {
                    const clientTranscript = await fetchTranscriptClient(data.videoId);
                    // Retry with the transcript text we just fetched
                    res = await fetch("/api/ai/summarize", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ text: clientTranscript }),
                    });
                    data = await res.json();
                } catch (clientErr: any) {
                    throw new Error(clientErr.message || "Bypass failed.");
                }
            }

            if (!res.ok) {
                throw new Error(data.error || "Failed to summarize video");
            }

            setSummary(data.summary);
        } catch (err: any) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-xl">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        {mode === "url" ? <Play className="w-6 h-6 text-red-500" /> : <FileEdit className="w-6 h-6 text-blue-400" />}
                        {mode === "url" ? "YouTube AI Summarizer" : "Manual Transcript Summarizer"}
                    </h2>

                    <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-600">
                        <button
                            onClick={() => { setMode("url"); setError(""); }}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${mode === "url" ? "bg-gray-700 text-white shadow-sm" : "text-gray-400 hover:text-white"}`}
                        >
                            <Link className="w-4 h-4" /> URL
                        </button>
                        <button
                            onClick={() => { setMode("manual"); setError(""); }}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${mode === "manual" ? "bg-gray-700 text-white shadow-sm" : "text-gray-400 hover:text-white"}`}
                        >
                            <FileEdit className="w-4 h-4" /> Manual
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSummarize} className="flex flex-col gap-4">
                    {mode === "url" ? (
                        <input
                            type="url"
                            required
                            placeholder="Paste YouTube Video URL here..."
                            className="bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none w-full transition-all"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                        />
                    ) : (
                        <textarea
                            required
                            rows={8}
                            placeholder="Paste the video transcript here..."
                            className="bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none w-full transition-all resize-y font-mono text-sm"
                            value={manualText}
                            onChange={(e) => setManualText(e.target.value)}
                        />
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 w-full md:w-auto self-end"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Processing...
                            </>
                        ) : (
                            "Summarize"
                        )}
                    </button>
                </form>

                {error && (
                    <div className="mt-6 bg-red-900/20 border border-red-800 rounded-xl p-4 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-red-400 text-sm font-medium">{error}</p>
                            {mode === "url" && (
                                <p className="text-red-300/70 text-xs mt-2">
                                    Tip: If the automated fetch fails, try switching to
                                    <button
                                        onClick={() => setMode("manual")}
                                        className="text-blue-400 hover:underline mx-1 font-medium"
                                    >
                                        Manual Mode
                                    </button>
                                    and pasting the transcript directly.
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {summary && (
                <div className="bg-gray-800 p-8 rounded-2xl border border-gray-700 shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex justify-between items-start mb-6">
                        <h3 className="text-xl font-bold flex items-center gap-2 text-green-400">
                            <FileText className="w-6 h-6" />
                            Study Notes & Summary
                        </h3>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(summary);
                                // Optional: simple toast notification could go here
                            }}
                            className="text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors"
                        >
                            <CheckCircle className="w-4 h-4" /> Copy
                        </button>
                    </div>

                    <div className="prose prose-invert max-w-none text-gray-300 leading-relaxed whitespace-pre-line">
                        {summary}
                    </div>
                </div>
            )}
        </div>
    );
}
