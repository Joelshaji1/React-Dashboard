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
        const isBlockResponse = (text: string, isTranscript = false) => {
            if (!text) return true;
            if (!isTranscript && text.length < 5000) return true;
            if (isTranscript && text.length < 2) return true;
            const terms = ["Service Unavailable", "unusual traffic", "sorry/index", "Robot Check", "automated requests"];
            return terms.some(term => text.toLowerCase().includes(term.toLowerCase()));
        };

        const gigaMeshProxies = [
            { name: "Direct", url: (u: string) => u, type: "text" },
            { name: "AllOrigins (Raw)", url: (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`, type: "text" },
            { name: "CorsProxy.io", url: (u: string) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`, type: "text" },
            { name: "CodeTabs", url: (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`, type: "text" },
            { name: "Htmldriven", url: (u: string) => `https://cors-proxy.htmldriven.com/?url=${encodeURIComponent(u)}`, type: "text" },
            { name: "FuckCORS", url: (u: string) => `https://api.fuckcors.com/proxy?url=${encodeURIComponent(u)}`, type: "text" },
            { name: "ThingProxy", url: (u: string) => `https://thingproxy.freeboard.io/fetch/${encodeURIComponent(u)}`, type: "text" }
        ];

        // 1. Get Video Page to catch Track URLs
        let html = "";
        for (const proxy of gigaMeshProxies) {
            try {
                setStatus(`Bypassing block (${proxy.name})...`);
                const res = await fetch(proxy.url(`https://www.youtube.com/watch?v=${videoId}`), { signal: AbortSignal.timeout(6000) });
                html = await res.text();
                if (html && !isBlockResponse(html) && (html.includes("ytInitialPlayerResponse") || html.includes("\"captions\":"))) break;
                html = "";
            } catch (e) { html = ""; }
        }

        if (!html) throw new Error("YouTube is temporarily blocking requests. Use Manual Mode.");

        // 2. Extract Tracks
        let captions;
        const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/);
        if (playerResponseMatch) {
            try { const captures = JSON.parse(playerResponseMatch[1]); captions = captures.captions; } catch (e) { /* ignore */ }
        }
        if (!captions) {
            const captionsMatch = html.match(/"captions":(\{.*?\})/);
            if (captionsMatch) captions = JSON.parse(captionsMatch[1]);
        }

        if (!captions?.playerCaptionsTracklistRenderer?.captionTracks) {
            throw new Error("No transcript tracks found for this video.");
        }

        const tracks = captions.playerCaptionsTracklistRenderer.captionTracks;
        let xmlData = "";
        const tryFormats = ["json3", "srv1", "srv2"];

        // 3. Ultra-Parallel Fetching
        for (const track of tracks.slice(0, 2)) {
            for (const fmt of tryFormats) {
                if (xmlData) break;
                let url = track.baseUrl + (track.baseUrl.includes("?") ? "&" : "?") + `fmt=${fmt}`;
                setStatus(`Fetching ${track.languageCode || "transcript"} (${fmt})...`);

                // Try Direct First
                try {
                    const dRes = await fetch(url, { signal: AbortSignal.timeout(4000) });
                    const dText = await dRes.text();
                    if (dText && !isBlockResponse(dText, true) && (dText.includes("<text") || dText.includes("events") || dText.includes("<p "))) {
                        xmlData = dText; break;
                    }
                } catch (e) { /* ignore direct */ }

                if (xmlData) break;

                // Fire Parallel Mesh
                try {
                    const results = await Promise.allSettled(gigaMeshProxies.slice(1).map(async (p) => {
                        const r = await fetch(p.url(url), { signal: AbortSignal.timeout(8000) });
                        const t = await r.text();
                        if (t && !isBlockResponse(t, true) && (t.includes("<text") || t.includes("events") || t.includes("<p "))) return t;
                        throw new Error("fail");
                    }));
                    const win = results.find(r => r.status === "fulfilled" && r.value) as any;
                    if (win) { xmlData = win.value; break; }
                } catch (e) { /* next fmt */ }
            }
            if (xmlData) break;
        }

        if (!xmlData) throw new Error("Giga-Mesh exhausted. Please try Manual Mode.");

        // 4. Parse
        const xmlString = typeof xmlData === 'string' ? xmlData : JSON.stringify(xmlData);
        try {
            const jsonData = JSON.parse(xmlString);
            if (jsonData.events) return jsonData.events.filter((e: any) => e.segs).map((e: any) => e.segs.map((s: any) => s.utf8).join("")).join(" ").trim();
        } catch (e) { /* not json */ }

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");
        const textNodes = Array.from(xmlDoc.getElementsByTagName("text"));
        if (textNodes.length > 0) return textNodes.map(n => n.textContent || "").join(" ").trim();

        const pNodes = Array.from(xmlDoc.getElementsByTagName("p"));
        if (pNodes.length > 0) return pNodes.map(n => n.textContent || "").join(" ").trim();

        const brute = xmlString.match(/>([^<]{2,})</g);
        if (brute) return brute.map(m => m.substring(1, m.length - 1).trim()).filter(t => t.length > 1 && !t.includes("<?xml")).join(" ").trim();

        throw new Error("Extraction failed.");
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

                    // Final Sanity Check: Ensure we didn't harvest an error page despite guards
                    if (clientTranscript.toLowerCase().includes("unusual traffic") ||
                        clientTranscript.toLowerCase().includes("service disruption") ||
                        clientTranscript.length < 100) {
                        throw new Error("Bypass produced invalid transcript data. YouTube is strictly blocking this request.");
                    }

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
