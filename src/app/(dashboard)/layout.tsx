import { Providers } from "../providers";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect("/login");
    }

    return (
        <Providers>
            <div className="flex h-screen bg-gray-900 text-white">
                {/* Sidebar */}
                <aside className="w-64 bg-gray-800 border-r border-gray-700 hidden md:flex flex-col">
                    <div className="p-6 border-b border-gray-700">
                        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
                            StudyDash
                        </h1>
                    </div>
                    <nav className="flex-1 p-4 space-y-2">
                        <Link
                            href="/dashboard"
                            className="flex items-center px-4 py-3 text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
                        >
                            Dashboard
                        </Link>
                        <Link
                            href="/documents"
                            className="flex items-center px-4 py-3 text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
                        >
                            Document Q&A
                        </Link>
                        {session.user.role === "ADMIN" && (
                            <Link
                                href="/admin"
                                className="flex items-center px-4 py-3 text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                Admin Panel
                            </Link>
                        )}
                    </nav>
                    <div className="p-4 border-t border-gray-700">
                        <div className="flex items-center gap-3 px-4 py-2">
                            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-sm font-bold">
                                {session.user?.email?.[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{session.user?.email}</p>
                                <p className="text-xs text-gray-400 truncate capitalize">{session.user?.role.toLowerCase()}</p>
                            </div>
                        </div>
                        <Link href="/api/auth/signout" className="mt-2 block w-full text-center text-xs text-red-400 hover:text-red-300">
                            Sign Out
                        </Link>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 overflow-y-auto p-4 md:p-8">
                    {children}
                </main>
            </div>
        </Providers>
    );
}
