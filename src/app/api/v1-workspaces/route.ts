import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const workspaces = await (prisma as any).workspace.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: "desc" },
            include: {
                _count: {
                    select: { documents: true }
                }
            }
        });

        return NextResponse.json(workspaces);
    } catch (e) {
        return NextResponse.json({ error: "Fetch failed", details: (e as Error).message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { name } = await req.json();
        if (!name) return NextResponse.json({ error: "Workspace name is required" }, { status: 400 });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const workspace = await (prisma as any).workspace.create({
            data: {
                name,
                userId: session.user.id
            }
        });

        return NextResponse.json(workspace);
    } catch (e) {
        return NextResponse.json({ error: "Creation failed", details: (e as Error).message }, { status: 500 });
    }
}
