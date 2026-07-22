import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  suspended: z.boolean(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const admin = await getSessionUser();
  if (!admin || admin.role !== "SUPER_MASTER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (id === admin.id) {
    return NextResponse.json({ error: "본인 계정은 정지할 수 없습니다." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const user = await prisma.user.update({
    where: { id },
    data: { suspended: parsed.data.suspended },
    select: {
      id: true,
      email: true,
      nickname: true,
      role: true,
      suspended: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ user });
}
