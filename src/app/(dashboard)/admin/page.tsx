import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { redirect } from "next/navigation";
import UserList from "@/components/UserList";

export default async function AdminPage() {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== "ADMIN") {
        redirect("/dashboard");
    }

    const users = await prisma.user.findMany({
        orderBy: { createdAt: "desc" },
    });

    // Serialize date for client component
    const serializedUsers = users.map((user) => ({
        ...user,
        createdAt: user.createdAt.toISOString()
    }));

    return (
        <div className="p-8">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-white">Admin Panel</h2>
                    <p className="text-gray-400 mt-1">Manage users and approvals</p>
                </div>
                <div className="bg-[#1f2937] px-4 py-2 rounded-lg border border-gray-800">
                    <span className="text-gray-400 mr-2">Total Users:</span>
                    <span className="text-white font-bold">{users.length}</span>
                </div>
            </div>

            <UserList initialUsers={serializedUsers} />
        </div>
    );
}
