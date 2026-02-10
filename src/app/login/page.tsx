"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        try {
            const res = await signIn("credentials", {
                redirect: false,
                email,
                password,
            });

            if (res?.error) {
                setError(res.error);
            } else {
                router.push("/dashboard");
            }
        } catch (err) {
            setError("An unexpected error occurred");
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-900 px-4">
            <div className="w-full max-w-md space-y-8 bg-gray-800 p-8 rounded-2xl shadow-xl border border-gray-700">
                <div className="text-center">
                    <h2 className="text-3xl font-bold text-white">Welcome Back</h2>
                    <p className="mt-2 text-gray-400">Sign in to access your dashboard</p>
                </div>

                {error && (
                    <div className="p-4 mb-4 text-sm text-red-500 bg-red-900/20 border border-red-900 rounded-lg">
                        {error}
                    </div>
                )}

                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-300">
                                Email address
                            </label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                required
                                className="mt-1 block w-full rounded-lg bg-gray-700 border border-gray-600 px-3 py-2 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                                Password
                            </label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                required
                                className="mt-1 block w-full rounded-lg bg-gray-700 border border-gray-600 px-3 py-2 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="w-full flex justify-center py-3 px-4 rounded-full bg-blue-600 hover:bg-blue-700 font-semibold text-white transition-all duration-200 shadow-lg shadow-blue-500/20"
                    >
                        Sign in
                    </button>
                </form>

                <div className="text-center mt-4">
                    <Link href="/register" className="text-sm text-blue-400 hover:text-blue-300">
                        Don't have an account? Sign up
                    </Link>
                </div>
            </div>
        </div>
    );
}
