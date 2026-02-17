"use client";

import { useState, useEffect, useCallback } from "react";
import { Upload, FileText, Send, Loader2, Trash2, FolderPlus, FolderOpen, ChevronRight } from "lucide-react";
import { toast } from "sonner";

interface Workspace {
    id: string;
    name: string;
    createdAt: string;
    _count?: {
        documents: number;
    };
}

interface Document {
    id: string;
    name: string;
    createdAt: string;
    workspaceId?: string | null;
}

export default function DocumentQA() {
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
    const [newWorkspaceName, setNewWorkspaceName] = useState("");
    const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);

    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [documents, setDocuments] = useState<Document[]>([]);
    const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
    const [question, setQuestion] = useState("");
    const [answer, setAnswer] = useState("");
    const [querying, setQuerying] = useState(false);

    const fetchWorkspaces = useCallback(async () => {
        try {
            const res = await fetch("/api/v1-workspaces");
            if (res.ok) {
                const data = await res.json();
                setWorkspaces(data);
                if (data.length > 0 && !selectedWorkspaceId) {
                    setSelectedWorkspaceId(data[0].id);
                }
            }
        } catch (error) {
            console.error("Error fetching workspaces:", error);
        }
    }, [selectedWorkspaceId]);

    const fetchDocuments = useCallback(async () => {
        if (!selectedWorkspaceId) {
            setDocuments([]);
            return;
        }
        const url = `/api/v1-docs?workspaceId=${selectedWorkspaceId}&t=${Date.now()}`;
        try {
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setDocuments(data);
            }
        } catch (error) {
            console.error("Error fetching documents:", error);
        }
    }, [selectedWorkspaceId]);

    useEffect(() => {
        fetchWorkspaces();
    }, [fetchWorkspaces]);

    useEffect(() => {
        fetchDocuments();
    }, [fetchDocuments]);

    const handleCreateWorkspace = async () => {
        if (!newWorkspaceName.trim()) return;
        setIsCreatingWorkspace(true);
        try {
            const res = await fetch("/api/v1-workspaces", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newWorkspaceName }),
            });
            if (res.ok) {
                const data = await res.json();
                toast.success("Workspace created");
                setNewWorkspaceName("");
                setSelectedWorkspaceId(data.id);
                fetchWorkspaces();
            } else {
                toast.error("Failed to create workspace");
            }
        } catch (error) {
            toast.error("Network error");
        } finally {
            setIsCreatingWorkspace(false);
        }
    };

    const handleUpload = async () => {
        if (!file || !selectedWorkspaceId) return;
        setUploading(true);
        const formData = new FormData();
        formData.append("file", file);
        formData.append("workspaceId", selectedWorkspaceId);

        try {
            const res = await fetch("/api/v1-docs", {
                method: "POST",
                body: formData,
            });
            if (res.ok) {
                toast.success("Document added to workspace");
                setFile(null);
                fetchDocuments();
                fetchWorkspaces(); // Update document count
            } else {
                const data = await res.json();
                toast.error(data.error || "Upload failed");
            }
        } catch (error) {
            toast.error("Network error");
        } finally {
            setUploading(false);
        }
    };

    const handleQuery = async () => {
        if (!selectedWorkspaceId || !question.trim()) return;
        setQuerying(true);
        setAnswer("");

        try {
            const res = await fetch("/api/v1-query", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    workspaceId: selectedWorkspaceId,
                    question
                }),
            });

            if (res.ok) {
                const data = await res.json();
                setAnswer(data.answer);
            } else {
                const data = await res.json();
                toast.error(data.error || "Query failed");
            }
        } catch (error) {
            toast.error("Network error");
        } finally {
            setQuerying(false);
        }
    };

    const handleDeleteDoc = async (e: React.MouseEvent, docId: string) => {
        e.stopPropagation();
        if (!confirm("Are you sure?")) return;
        try {
            const res = await fetch(`/api/v1-docs/${docId}`, { method: "DELETE" });
            if (res.ok) {
                toast.success("Document removed");
                fetchDocuments();
                fetchWorkspaces();
            }
        } catch (error) {
            toast.error("Error deleting");
        }
    };

    const activeWorkspace = workspaces.find(w => w.id === selectedWorkspaceId);

    return (
        <div className="flex flex-col md:flex-row gap-6 p-6 min-h-[calc(100vh-100px)]">
            {/* Sidebar: Workspace Management */}
            <div className="w-full md:w-72 flex flex-col gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                    <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <FolderOpen className="w-4 h-4" />
                        Workspaces
                    </h2>

                    <div className="space-y-1 mb-6">
                        {workspaces.map((ws) => (
                            <button
                                key={ws.id}
                                onClick={() => setSelectedWorkspaceId(ws.id)}
                                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-between group ${selectedWorkspaceId === ws.id
                                        ? "bg-indigo-600 text-white"
                                        : "text-slate-600 hover:bg-slate-100"
                                    }`}
                            >
                                <span className="truncate">{ws.name}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${selectedWorkspaceId === ws.id ? "bg-indigo-500" : "bg-slate-100"
                                    }`}>
                                    {ws._count?.documents || 0}
                                </span>
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-col gap-2 pt-4 border-t border-slate-100">
                        <input
                            type="text"
                            placeholder="New Workspace..."
                            value={newWorkspaceName}
                            onChange={(e) => setNewWorkspaceName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleCreateWorkspace()}
                            className="text-xs p-2 rounded border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <button
                            onClick={handleCreateWorkspace}
                            disabled={isCreatingWorkspace || !newWorkspaceName.trim()}
                            className="bg-indigo-50 text-indigo-700 text-xs py-2 rounded font-semibold hover:bg-indigo-100 transition flex items-center justify-center gap-1"
                        >
                            {isCreatingWorkspace ? <Loader2 className="w-3 h-3 animate-spin" /> : <FolderPlus className="w-3 h-3" />}
                            Create Workspace
                        </button>
                    </div>
                </div>

                {/* Quick Stats or Tips */}
                <div className="bg-indigo-600 rounded-xl p-5 text-white shadow-lg shadow-indigo-100">
                    <h3 className="text-xs font-bold uppercase tracking-wider mb-2 opacity-80">Pro Tip</h3>
                    <p className="text-sm leading-relaxed">
                        Query multiple documents at once by selecting a workspace. The AI will cite which file the info came from!
                    </p>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col gap-6">
                {/* Upload Section */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-semibold flex items-center gap-2 text-slate-900">
                            <Upload className="w-5 h-5 text-indigo-600" />
                            {activeWorkspace ? `Add to ${activeWorkspace.name}` : "Upload Document"}
                        </h2>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        <input
                            type="file"
                            accept=".pdf,.txt"
                            onChange={(e) => setFile(e.target.files?.[0] || null)}
                            className="block w-full text-sm text-slate-500
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-lg file:border-0
                                file:text-sm file:font-semibold
                                file:bg-indigo-50 file:text-indigo-700
                                hover:file:bg-indigo-100 cursor-pointer"
                        />
                        <button
                            onClick={handleUpload}
                            disabled={!file || !selectedWorkspaceId || uploading}
                            className="w-full sm:w-auto bg-indigo-600 text-white px-8 py-2 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                        >
                            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Upload"}
                        </button>
                    </div>
                    {!selectedWorkspaceId && (
                        <p className="mt-2 text-xs text-amber-600 font-medium">Please select a workspace first</p>
                    )}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
                    {/* Document List (In active workspace) */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col xl:col-span-2 overflow-hidden">
                        <div className="p-5 border-b border-slate-100">
                            <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-900">
                                <FileText className="w-5 h-5 text-indigo-600" />
                                Documents
                            </h2>
                        </div>
                        <div className="p-2 flex-1 max-h-[500px] overflow-y-auto space-y-1">
                            {documents.length === 0 ? (
                                <div className="text-center py-12 text-slate-400">
                                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                    <p className="text-sm">No documents in this workspace</p>
                                </div>
                            ) : (
                                documents.map((doc) => (
                                    <div
                                        key={doc.id}
                                        className="group p-3 rounded-lg border border-transparent hover:border-slate-100 hover:bg-slate-50 transition flex items-center justify-between"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-slate-700 truncate">{doc.name}</p>
                                            <p className="text-[10px] text-slate-400">
                                                {new Date(doc.createdAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                        <button
                                            onClick={(e) => handleDeleteDoc(e, doc.id)}
                                            className="p-1.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-md transition-all opacity-0 group-hover:opacity-100"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Q&A Interface */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col xl:col-span-3">
                        <div className="p-5 border-b border-slate-100">
                            <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-900">
                                <Send className="w-5 h-5 text-indigo-600" />
                                Workspace Intelligence
                            </h2>
                        </div>

                        <div className="p-6 flex flex-col gap-6 flex-1">
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder={selectedWorkspaceId ? "Ask a question across all documents..." : "Select a workspace to begin"}
                                    value={question}
                                    onChange={(e) => setQuestion(e.target.value)}
                                    disabled={!selectedWorkspaceId || querying}
                                    onKeyDown={(e) => e.key === "Enter" && handleQuery()}
                                    className="w-full pl-4 pr-24 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50 text-slate-900 font-medium placeholder:text-slate-400 transition-all"
                                />
                                <button
                                    onClick={handleQuery}
                                    disabled={!selectedWorkspaceId || !question.trim() || querying}
                                    className="absolute right-2 top-2 bg-indigo-600 text-white px-5 py-1.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition flex items-center gap-2"
                                >
                                    {querying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ask"}
                                </button>
                            </div>

                            <div className="flex-1 min-h-[300px] flex flex-col">
                                {answer ? (
                                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                                        <div className="p-5 bg-indigo-50/30 rounded-2xl border border-indigo-100">
                                            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-3">AI Intelligence Answer</p>
                                            <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap font-medium">
                                                {answer}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-slate-300 text-center px-8">
                                        <Loader2 className={`w-10 h-10 mb-4 opacity-10 ${querying ? "animate-spin opacity-100 text-indigo-600" : ""}`} />
                                        <p className="text-sm font-medium">
                                            {querying ? "Synthesizing information from multiple sources..." : "Your answer will appear here with source citations."}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
