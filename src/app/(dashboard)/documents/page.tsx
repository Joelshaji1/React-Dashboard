import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import DocumentQA from "@/components/DocumentQA";

export default async function DocumentsPage() {
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect("/login");
    }

    return (
        <div className="h-full bg-slate-50 min-h-screen">
            <div className="p-8">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
                        Document Q&A
                        <span className="text-xs font-normal text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full border border-indigo-100">v1.10 - HybridForce</span>
                    </h1>
                    <p className="text-slate-500 mt-2">
                        Upload your study materials (PDF/Text) and ask anything.
                    </p>
                </div>
                <DocumentQA />
            </div>
        </div>
    );
}
