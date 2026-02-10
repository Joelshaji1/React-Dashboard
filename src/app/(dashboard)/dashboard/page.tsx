import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import YouTubeSummarizer from "@/components/YouTubeSummarizer";

export default async function DashboardPage() {
    const session = await getServerSession(authOptions);

    return (
        <div className="max-w-5xl mx-auto">
            <header className="mb-10">
                <h1 className="text-3xl font-bold text-white">
                    Hello, {session?.user?.email?.split("@")[0]} 👋
                </h1>
                <p className="text-gray-400 mt-2">
                    Ready to learn something new today? Paste a video link below.
                </p>
            </header>

            <YouTubeSummarizer />
        </div>
    );
}
