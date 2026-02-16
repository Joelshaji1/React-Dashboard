"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Shield, User } from "lucide-react";

type UserData = {
    id: string;
    email: string;
    role: string;
    isApproved: boolean;
    createdAt: Date;
};

export default function UserList({ users: initialUsers }: { users: UserData[] }) {
    const router = useRouter();
    const [users, setUsers] = useState<UserData[]>(initialUsers);
    const [loadingId, setLoadingId] = useState<string | null>(null);

    const toggleApproval = async (userId: string, currentStatus: boolean) => {
        setLoadingId(userId);
        try {
            const res = await fetch("/api/admin/approve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, approve: !currentStatus }),
            });

            if (res.ok) {
                setUsers(
                    users.map((u) =>
                        u.id === userId ? { ...u, isApproved: !currentStatus } : u
                    )
                );
                router.refresh();
            }
        } catch {
            console.error("Failed to update status");
        } finally {
            setLoadingId(null);
        }
    };

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-400">
                <thead className="bg-gray-700/50 text-xs uppercase text-gray-300">
                    <tr>
                        <th className="px-6 py-4">User</th>
                        <th className="px-6 py-4">Role</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                    {users.map((user) => (
                        <tr key={user.id} className="hover:bg-gray-700/30 transition-colors">
                            <td className="px-6 py-4 font-medium text-white">{user.email}</td>
                            <td className="px-6 py-4 flex items-center gap-2">
                                {user.role === "ADMIN" ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-900/30 px-2 py-1 text-xs font-semibold text-purple-400 border border-purple-800">
                                        <Shield className="w-3 h-3" /> Admin
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-900/30 px-2 py-1 text-xs font-semibold text-blue-400 border border-blue-800">
                                        <User className="w-3 h-3" /> User
                                    </span>
                                )}
                            </td>
                            <td className="px-6 py-4">
                                {user.isApproved ? (
                                    <span className="inline-flex items-center gap-1 text-green-400">
                                        <Check className="w-4 h-4" /> Approved
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 text-yellow-400">
                                        <X className="w-4 h-4" /> Pending
                                    </span>
                                )}
                            </td>
                            <td className="px-6 py-4">
                                {user.role !== "ADMIN" && (
                                    <button
                                        onClick={() => toggleApproval(user.id, user.isApproved)}
                                        disabled={loadingId === user.id}
                                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${user.isApproved
                                            ? "bg-red-900/30 text-red-400 hover:bg-red-900/50 border border-red-800"
                                            : "bg-green-900/30 text-green-400 hover:bg-green-900/50 border border-green-800"
                                            }`}
                                    >
                                        {loadingId === user.id
                                            ? "Updating..."
                                            : user.isApproved
                                                ? "Revoke Access"
                                                : "Approve Access"}
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
