"use client";

import { useState, useEffect, useCallback } from "react";
import { Upload, FileText, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Document {
    id: string;
    name: string;
    createdAt: string;
}

export default function DocumentQA() {
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [documents, setDocuments] = useState<Document[]>([]);
    const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
    const [question, setQuestion] = useState("");
    const [answer, setAnswer] = useState("");
    const [querying, setQuerying] = useState(false);

    const fetchDocuments = useCallback(async () => {
        const url = `/api/v1-docs?t=${Date.now()}`;
        try {
            const res = await fetch(url, {
                headers: { "x-diagnostic": "v1-list-request" }
            });
            if (res.ok) {
                const data = await res.json();
                setDocuments(data);
                if (data.length > 0 && !selectedDocId) {
                    setSelectedDocId(data[0].id);
                }
            } else {
                let errorDetails = "";
                try {
                    const data = await res.json();
                    errorDetails = data.details || data.error || "";
                } catch {
                    errorDetails = res.statusText;
                }
                toast.error(`Fetch failed on ${url}: ${res.status} ${errorDetails}`);
            }
        } catch (error) {
            const err = error as Error;
            console.error("Error fetching documents:", err);
            toast.error(`Network error fetching ${url}: ${err.message}`);
        }
    }, [selectedDocId]);

    useEffect(() => {
        fetchDocuments();
    }, [fetchDocuments]);

    const handleUpload = async () => {
        if (!file) return;
        setUploading(true);
        const url = `/api/v1-docs?t=${Date.now()}`;

        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch(url, {
                method: "POST",
                body: formData,
                headers: { "x-diagnostic": "v1-upload-request" }
            });
            if (res.ok) {
                toast.success("Document uploaded successfully");
                setFile(null);
                fetchDocuments();
            } else {
                let errorMessage = `Upload failed: Status ${res.status}`;
                try {
                    const data = await res.json();
                    errorMessage = data.details || data.error || errorMessage;
                } catch {
                    errorMessage = `Server error ${res.status}: ${res.statusText}`;
                }
                toast.error(errorMessage);
            }
        } catch (error) {
            const err = error as Error;
            toast.error(`Network error on ${url}: ${err.message}`);
        } finally {
            setUploading(false);
        }
    };

    const handleQuery = async () => {
        if (!selectedDocId || !question.trim()) return;
        setQuerying(true);
        setAnswer("");
        const url = `/api/v1-query?t=${Date.now()}`;

        try {
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-diagnostic": "v1-query-request"
                },
                body: JSON.stringify({ documentId: selectedDocId, question }),
            });

            if (res.ok) {
                const data = await res.json();
                setAnswer(data.answer);
            } else {
                let errorMsg = `Query failed: Status ${res.status}`;
                try {
                    const data = await res.json();
                    errorMsg = data.error || errorMsg;
                } catch {
                    errorMsg = `Server error ${res.status}: ${res.statusText}`;
                }
                toast.error(errorMsg);
            }
        } catch (error) {
            const err = error as Error;
            toast.error(`Network error on ${url}: ${err.message}`);
        } finally {
            setQuerying(false);
        }
    };

    return (
        <div className="p-6 space-y-8">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <Upload className="w-5 h-5 text-indigo-600" />
                    Upload Document
                </h2>
                <div className="flex items-center gap-4">
                    <input
                        type="file"
                        accept=".pdf,.txt"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                        className="block w-full text-sm text-slate-500
                            file:mr-4 file:py-2 file:px-4
                            file:rounded-full file:border-0
                            file:text-sm file:font-semibold
                            file:bg-indigo-50 file:text-indigo-700
                            hover:file:bg-indigo-100 cursor-pointer"
                    />
                    <button
                        onClick={handleUpload}
                        disabled={!file || uploading}
                        className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
                    >
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Upload"}
                    </button>
                </div>
                <p className="mt-2 text-xs text-slate-400">Supported formats: PDF, TXT (Max 10MB)</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Document List */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 md:col-span-1">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-indigo-600" />
                        My Documents
                    </h2>
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {documents.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-4">No documents uploaded yet.</p>
                        ) : (
                            documents.map((doc) => (
                                <div
                                    key={doc.id}
                                    onClick={() => setSelectedDocId(doc.id)}
                                    className={`p-3 rounded-lg cursor-pointer border transition ${selectedDocId === doc.id
                                        ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                                        : "bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100"
                                        }`}
                                >
                                    <p className="text-sm font-medium truncate">{doc.name}</p>
                                    <p className="text-[10px] opacity-70">
                                        {new Date(doc.createdAt).toLocaleDateString()}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Q&A Interface */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 md:col-span-2">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Send className="w-5 h-5 text-indigo-600" />
                        Ask Your Document
                    </h2>

                    <div className="space-y-4">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder={selectedDocId ? "Ask a question about the selected document..." : "Select or upload a document first"}
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                disabled={!selectedDocId || querying}
                                className="flex-1 p-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                                onKeyDown={(e) => e.key === "Enter" && handleQuery()}
                            />
                            <button
                                onClick={handleQuery}
                                disabled={!selectedDocId || !question.trim() || querying}
                                className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
                            >
                                {querying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ask"}
                            </button>
                        </div>

                        {answer && (
                            <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Answer</p>
                                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{answer}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
