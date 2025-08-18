import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = params;
  const conv = await prisma.conversation.findFirst({ where: { id, userId: session.user.id }, select: { id: true } });
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.conversation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}


