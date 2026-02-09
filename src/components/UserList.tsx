"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Clock } from "lucide-react";

interface User {
    id: string;
    email: string;
    role: string;
    isApproved: boolean;
    createdAt: string;
}

export default function UserList({ initialUsers }: { initialUsers: User[] }) {
    const [users, setUsers] = useState(initialUsers);
    const [loadingId, setLoadingId] = useState<string | null>(null);

    const handleApprove = async (userId: string) => {
        setLoadingId(userId);
        try {
            const res = await fetch("/api/admin/approve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId }),
            });

            if (!res.ok) throw new Error("Failed to approve");

            setUsers(users.map(user =>
                user.id === userId ? { ...user, isApproved: true } : user
            ));
            toast.success("User approved successfully");
        } catch (error) {
            toast.error("Failed to approve user");
        } finally {
            setLoadingId(null);
        }
    };

    return (
        <div className="rounded-md border border-gray-800 bg-[#111827] overflow-hidden text-sm">
            <div className="grid grid-cols-4 gap-4 p-4 font-medium text-gray-400 border-b border-gray-800 bg-[#1f2937]">
                <div>Email</div>
                <div>Role</div>
                <div>Status</div>
                <div className="text-right">Action</div>
            </div>
            <div className="divide-y divide-gray-800">
                {users.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">No users found</div>
                ) : (
                    users.map((user) => (
                        <div key={user.id} className="grid grid-cols-4 gap-4 p-4 items-center hover:bg-white/5 transition-colors">
                            <div className="text-white truncate" title={user.email}>{user.email}</div>
                            <div>
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${user.role === 'ADMIN'
                                        ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                        : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                    }`}>
                                    {user.role}
                                </span>
                            </div>
                            <div>
                                {user.isApproved ? (
                                    <span className="inline-flex items-center text-emerald-400">
                                        <CheckCircle className="w-4 h-4 mr-1.5" />
                                        Approved
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center text-amber-400">
                                        <Clock className="w-4 h-4 mr-1.5" />
                                        Pending
                                    </span>
                                )}
                            </div>
                            <div className="text-right">
                                {!user.isApproved && (
                                    <Button
                                        size="sm"
                                        onClick={() => handleApprove(user.id)}
                                        isLoading={loadingId === user.id}
                                        className="bg-emerald-600 hover:bg-emerald-500 text-white h-8"
                                    >
                                        Approve
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
