import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("conversationId");
  if (!conversationId) return NextResponse.json({ error: "Missing conversationId" }, { status: 400 });
  const conv = await prisma.conversation.findFirst({ where: { id: conversationId, userId: session.user.id }, select: { id: true } });
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, speechContent: true, createdAt: true },
  });
  return NextResponse.json({ messages });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { conversationId, role, content, speechContent } = (await req.json()) as {
    conversationId?: string;
    role?: "user" | "assistant" | "system";
    content?: string;
    speechContent?: string;
  };
  if (!conversationId || !role || typeof content !== "string") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const conv = await prisma.conversation.findFirst({ where: { id: conversationId, userId: session.user.id }, select: { id: true } });
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const message = await prisma.message.create({
    data: { conversationId, role, content, speechContent: speechContent || null },
    select: { id: true, role: true, content: true, speechContent: true, createdAt: true },
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  return NextResponse.json({ message });
}


