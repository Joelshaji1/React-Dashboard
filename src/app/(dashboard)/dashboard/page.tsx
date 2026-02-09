import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { redirect } from "next/navigation";
import { CheckCircle, AlertCircle, Shield } from "lucide-react";

export default async function DashboardPage() {
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect("/login");
    }

    // If admin, redirect to admin panel
    if (session.user.role === "ADMIN") {
        redirect("/admin");
    }

    const isApproved = session.user.isApproved;

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold tracking-tight mb-8 text-white">Dashboard</h2>
            <div className="grid gap-6 md:grid-cols-2">
                <Card className="bg-[#1f2937] border-gray-800 text-white">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Shield className="w-5 h-5 text-indigo-400" />
                            Account Status
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={`flex items-start p-4 rounded-lg border ${isApproved
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                            : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                            }`}>
                            {isApproved ? (
                                <CheckCircle className="h-6 w-6 mr-3 shrink-0 mt-0.5" />
                            ) : (
                                <AlertCircle className="h-6 w-6 mr-3 shrink-0 mt-0.5" />
                            )}
                            <div>
                                <p className="font-semibold text-lg mb-1">
                                    {isApproved ? "Active" : "Pending Approval"}
                                </p>
                                <p className="text-sm opacity-90">
                                    {isApproved
                                        ? "You have full access to the platform."
                                        : "Your account is awaiting administrator approval. Limited access until approved."}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-[#1f2937] border-gray-800 text-white">
                    <CardHeader>
                        <CardTitle>Profile Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <p className="text-sm text-gray-400">Email Address</p>
                            <p className="font-medium">{session.user.email}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-400">User ID</p>
                            <p className="font-mono text-xs text-gray-500 break-all">{session.user.id}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
