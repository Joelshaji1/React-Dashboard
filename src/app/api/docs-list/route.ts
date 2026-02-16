import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const documents = await (prisma as any).document.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                name: true,
                createdAt: true,
            }
        });

        return NextResponse.json(documents);
    } catch (error) {
        const err = error as Error;
        console.error("Fetch docs-list error:", err);
        return NextResponse.json({ error: err.message || "Failed to fetch documents" }, { status: 500 });
    }
}
