import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "SUPER_MASTER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      nickname: true,
      role: true,
      suspended: true,
      createdAt: true,
    },
  });
  const total = users.length;
  const active = users.filter((u) => !u.suspended).length;
  return NextResponse.json({ users, stats: { total, active } });
}
