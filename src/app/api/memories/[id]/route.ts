import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  const id = decodeURIComponent(segments[segments.length - 1] || "");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { title, content } = (await req.json()) as { title?: string | null; content?: string };
  const existing = await prisma.memory.findFirst({ where: { id, userId: session.user.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const memory = await prisma.memory.update({
    where: { id },
    data: {
      title: typeof title === "string" ? title.trim() || null : title ?? undefined,
      content: typeof content === "string" ? content.trim() : undefined,
    },
    select: { id: true, title: true, content: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json({ memory });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  const id = decodeURIComponent(segments[segments.length - 1] || "");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const existing = await prisma.memory.findFirst({ where: { id, userId: session.user.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.memory.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}


