import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function DELETE(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const docId = params.id;

        // Verify ownership
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const document = await (prisma as any).document.findUnique({
            where: { id: docId },
            select: { userId: true }
        });

        if (!document) {
            return NextResponse.json({ error: "Document not found" }, { status: 404 });
        }

        if (document.userId !== session.user.id) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Delete
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma as any).document.delete({
            where: { id: docId }
        });

        return NextResponse.json({ message: "Document deleted successfully" });
    } catch (error) {
        console.error("DELETE /api/v1-docs/[id] error:", error);
        return NextResponse.json({ error: "Delete failed", details: (error as Error).message }, { status: 500 });
    }
}
