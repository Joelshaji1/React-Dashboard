import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import UserList from "@/components/UserList";
import { redirect } from "next/navigation";

export default async function AdminPage() {
    const session = await getServerSession(authOptions);

    if (session?.user?.role !== "ADMIN") {
        redirect("/dashboard");
    }

    const users = await prisma.user.findMany({
        orderBy: { createdAt: "desc" },
    });

    return (
        <div className="max-w-6xl mx-auto">
            <header className="mb-10">
                <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
                <p className="text-gray-400 mt-2">Manage users and approvals.</p>
            </header>

            <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
                <UserList users={users} />
            </div>
        </div>
    );
}
