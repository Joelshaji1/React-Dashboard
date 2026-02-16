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

    const fetchTranscriptClient = async (videoId: string) => {
        const proxies = [
            { name: "AllOrigins", url: (u: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`, type: "json" },
            { name: "CorsProxy.io", url: (u: string) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`, type: "text" },
            { name: "CodeTabs", url: (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`, type: "text" },
            { name: "ThingProxy", url: (u: string) => `https://thingproxy.freeboard.io/fetch/${u}`, type: "text" }
        ];

        let html = "";
        let lastError = "";

        for (let i = 0; i < proxies.length; i++) {
            const proxy = proxies[i];
            try {
                setStatus(`Bypassing block (${proxy.name})...`);
                const res = await fetch(proxy.url(`https://www.youtube.com/watch?v=${videoId}`));
                if (!res.ok) throw new Error(`Status ${res.status}`);

                if (proxy.type === "json") {
                    const data = await res.json();
                    html = data.contents || data;
                } else {
                    html = await res.text();
                }

                if (typeof html !== "string") html = JSON.stringify(html);

                // Content Guard: Ensure this is a real video page, not a "Sorry" page
                const isRealPage = html.includes("ytInitialPlayerResponse") || html.includes("\"captions\":");
                const isBlockPage = html.includes("Service Unavailable") || html.includes("unusual traffic") || html.includes("action=\"https://www.google.com/sorry/index\"");

                if (isRealPage && !isBlockPage) break;

                // Discard invalid content and continue to next proxy
                html = "";
                lastError = `${proxy.name}: Returned a block page or invalid content.`;
            } catch (e: any) {
                lastError = `${proxy.name}: ${e.message}`;
                console.warn(`Proxy ${proxy.name} failed:`, e.message);
                html = "";
            }
        }

        if (!html || html.length < 500) {
            throw new Error(`Bypass failed: YouTube is temporarily blocking automated requests. Please try again in 5-10 minutes or use Manual Mode.`);
        }

        try {
            setStatus("Extracting transcript...");
            const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/);
            let captions;

            if (playerResponseMatch) {
                try {
                    const playerResponse = JSON.parse(playerResponseMatch[1]);
                    captions = playerResponse.captions;
                } catch (e) {
                    console.warn("Player response parse failed");
                }
            }

            if (!captions) {
                const captionsMatch = html.match(/"captions":(\{.*?\})/);
                if (captionsMatch) {
                    captions = JSON.parse(captionsMatch[1]);
                }
            }

            if (!captions || !captions.playerCaptionsTracklistRenderer) {
                throw new Error("This video doesn't have an available transcript.");
            }

            const tracks = captions.playerCaptionsTracklistRenderer.captionTracks;
            if (!tracks || tracks.length === 0) throw new Error("No caption tracks found (captions might be disabled by the creator).");

            // Force srv1 (XML) format for consistent parsing
            let baseUrl = tracks[0].baseUrl;
            if (!baseUrl.includes("fmt=")) {
                baseUrl += "&fmt=srv1";
            }

            let xml = "";
            for (const proxy of proxies) {
                try {
                    const res = await fetch(proxy.url(baseUrl));
                    if (proxy.type === "json") {
                        const data = await res.json();
                        xml = data.contents || data;
                    } else {
                        xml = await res.text();
                    }
                    if (xml && (xml.includes("<text") || xml.includes("<p ") || xml.includes("events"))) break;
                } catch (e) { /* next */ }
            }

            if (!xml) throw new Error("Could not download the transcript file.");

            setStatus("Extracting text content...");
            const xmlString = typeof xml === 'string' ? xml : JSON.stringify(xml);

            // 1. DOM Parser (Standard XML/SRV1/SRV2)
            try {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlString, "text/xml");

                // Try <text> (SRV1)
                const textNodes = Array.from(xmlDoc.getElementsByTagName("text"));
                if (textNodes.length > 0) {
                    return textNodes.map(n => n.textContent || "").join(" ").trim();
                }

                // Try <p> (SRV2/TimedText)
                const pNodes = Array.from(xmlDoc.getElementsByTagName("p"));
                if (pNodes.length > 0) {
                    return pNodes.map(n => n.textContent || "").join(" ").trim();
                }
            } catch (e) {
                console.warn("DOMParser failed, falling back to regex...");
            }

            // 2. JSON Parser (JSON3/Events)
            try {
                const jsonData = typeof xml === 'string' ? JSON.parse(xml) : xml;
                if (jsonData.events) {
                    const text = jsonData.events
                        .filter((e: any) => e.segs)
                        .map((e: any) => e.segs.map((s: any) => s.utf8).join(""))
                        .join(" ")
                        .trim();
                    if (text) return text;
                }
            } catch (e) { /* not json */ }

            // 3. Brute Force Regex (Catch-all for any tag-based format)
            // This extracts any content between <tags> that doesn't look like code/metadata
            const bruteForceMatch = xmlString.match(/>([^<]{2,})</g);
            if (bruteForceMatch) {
                const extracted = bruteForceMatch
                    .map(m => m.substring(1, m.length - 1).trim())
                    .filter(t => !t.includes("<?xml") && !t.startsWith("http") && t.length > 1)
                    .join(" ");

                if (extracted.length > 50) {
                    console.log("Omni-Parse: Used brute-force regex successfully.");
                    return extracted.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
                }
            }

            throw new Error("Bypass succeeded, but transcript content is unreadable. The video might be using a protected or unsupported caption format.");
        } catch (e: any) {
            console.error("Extraction failed:", e);
            throw new Error(`Auto-fix failed: ${e.message}`);
        }
    };

    const handleSummarize = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        setSummary("");
        setStatus("Starting...");

        try {
            setStatus("Preparing transcript...");
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
                setStatus("IP Blocked. Applying auto-bypass...");
                try {
                    const clientTranscript = await fetchTranscriptClient(data.videoId);
                    setStatus("Analyzing video content...");
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
