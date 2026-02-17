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
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");

    const handleSummarize = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        setSummary("");
        setStatus("Preparing transcript...");

        try {
            const res = await fetch("/api/ai/summarize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: mode === "url" ? url : undefined,
                    text: mode === "manual" ? manualText : undefined
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                // If it's a 403 IP block, even our server failovers failed
                if (res.status === 403) {
                    let msg = "YouTube is strictly blocking this video.";
                    if (data.keyCheck) msg += `\n[Key Check: ${data.keyCheck}]`;
                    if (data.diagnostics && data.diagnostics !== "No extra info provided.") {
                        msg += `\n[Suppadata Error: ${data.diagnostics}]`;
                    }
                    throw new Error(msg);
                }
                throw new Error(data.error || "Failed to summarize video");
            }

            setStatus("Finalizing summary...");
            setSummary(data.summary);
        } catch (err: any) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
            setStatus("");
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
                                {status || "Processing..."}
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

                            {error.includes("Giga-Mesh exhausted") || error.includes("strictly blocking") ? (
                                <div className="mt-3 p-3 bg-red-900/30 rounded-lg border border-red-700/50">
                                    <p className="text-red-200 text-xs font-bold mb-2 flex items-center gap-1">
                                        🛡️ MANUAL ASSIST (100% GUARANTEE)
                                    </p>
                                    <ol className="text-red-300/80 text-[11px] space-y-1 list-decimal ml-4">
                                        <li>Open this video on YouTube in a new tab.</li>
                                        <li>Open Console (F12 or Inspect) and paste: <code className="bg-black/50 px-1 rounded text-white">ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks[0].baseUrl</code></li>
                                        <li>Copy the URL it gives you, open it, and paste that text into <strong>Manual Mode</strong>.</li>
                                    </ol>
                                </div>
                            ) : (
                                mode === "url" && (
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
                                )
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
