"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
    LayoutDashboard,
    ShieldCheck,
    LogOut,
    UserCircle
} from "lucide-react";

interface SidebarProps {
    userRole?: string;
}

export default function Sidebar({ userRole }: SidebarProps) {
    const pathname = usePathname();

    const routes = [
        {
            label: "Dashboard",
            icon: LayoutDashboard,
            href: "/dashboard",
            color: "text-sky-500",
        },
        ...(userRole === "ADMIN" ? [{
            label: "Admin Panel",
            icon: ShieldCheck,
            href: "/admin",
            color: "text-emerald-500",
        }] : []),
    ];

    return (
        <div className="space-y-4 py-4 flex flex-col h-full bg-[#111827] text-white">
            <div className="px-3 py-2 flex-1">
                <Link href="/dashboard" className="flex items-center pl-3 mb-14">
                    <div className="relative w-8 h-8 mr-4">
                        <div className="absolute inset-0 bg-gradient-to-tr from-violet-600 to-indigo-600 rounded-lg animate-pulse" />
                    </div>
                    <h1 className="text-2xl font-bold">
                        Dashboard
                    </h1>
                </Link>
                <div className="space-y-1">
                    {routes.map((route) => (
                        <Link
                            key={route.href}
                            href={route.href}
                            className={cn(
                                "text-sm group flex p-3 w-full justify-start font-medium cursor-pointer hover:text-white hover:bg-white/10 rounded-lg transition",
                                pathname === route.href ? "text-white bg-white/10" : "text-zinc-400"
                            )}
                        >
                            <div className="flex items-center flex-1">
                                <route.icon className={cn("h-5 w-5 mr-3", route.color)} />
                                {route.label}
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
            <div className="px-3 py-2">
                <div className="bg-white/5 rounded-lg p-3 mb-4">
                    <div className="flex items-center gap-x-3">
                        <UserCircle className="w-8 h-8 text-zinc-400" />
                        <div>
                            <p className="text-sm font-medium text-white">Current User</p>
                            <p className="text-xs text-zinc-400">{userRole}</p>
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => signOut()}
                    className="text-sm group flex p-3 w-full justify-start font-medium cursor-pointer hover:text-white hover:bg-white/10 rounded-lg transition text-zinc-400"
                >
                    <div className="flex items-center flex-1">
                        <LogOut className="h-5 w-5 mr-3 text-red-500" />
                        Sign Out
                    </div>
                </button>
            </div>
        </div>
    );
}
