import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const conversations = await prisma.conversation.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json({ conversations });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { title } = (await req.json()) as { title?: string };
  const now = new Date();
  const conversation = await prisma.conversation.create({
    data: {
      userId: session.user.id,
      title: title && title.trim().length ? title.trim() : `New chat ${now.toLocaleTimeString()}`,
    },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json({ conversation });
}


