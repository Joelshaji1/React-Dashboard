import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 text-white">
      <div className="text-center space-y-6 max-w-2xl px-4">
        <h1 className="text-5xl font-bold tracking-tight sm:text-7xl bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
          AI Study Dashboard
        </h1>
        <p className="text-xl text-gray-400">
          Transform YouTube videos into concise study notes instantly. Join our platform to accelerate your learning.
        </p>
        <div className="flex justify-center gap-4 mt-8">
          <Link
            href="/login"
            className="px-8 py-3 rounded-full bg-blue-600 hover:bg-blue-700 font-semibold transition-all duration-200 shadow-lg shadow-blue-500/20"
          >
            Log In
          </Link>
          <Link
            href="/register"
            className="px-8 py-3 rounded-full bg-gray-800 hover:bg-gray-700 border border-gray-700 font-semibold transition-all duration-200"
          >
            Sign Up
          </Link>
        </div>
      </div>
    </div>
  );
}
