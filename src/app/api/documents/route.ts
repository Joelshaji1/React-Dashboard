import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const documents = await prisma.document.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                name: true,
                createdAt: true,
            }
        });

        return NextResponse.json(documents);

    } catch (error: any) {
        console.error("Fetch documents error:", error);
        return NextResponse.json({ error: error.message || "Failed to fetch documents" }, { status: 500 });
    }
}
