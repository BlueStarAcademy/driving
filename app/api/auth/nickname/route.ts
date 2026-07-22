import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, publicUser } from "@/lib/auth";
import { isNicknameAllowed } from "@/lib/profanity";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  nickname: z.string().min(2).max(16),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success || !isNicknameAllowed(parsed.data.nickname)) {
    return NextResponse.json(
      { error: "닉네임은 2~16자, 문자/숫자/_만 가능합니다." },
      { status: 400 },
    );
  }
  const nickname = parsed.data.nickname.trim();
  const taken = await prisma.user.findFirst({
    where: { nickname, NOT: { id: user.id } },
  });
  if (taken) {
    return NextResponse.json({ error: "이미 사용 중인 닉네임입니다." }, { status: 409 });
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { nickname },
  });
  return NextResponse.json({
    user: publicUser({
      id: updated.id,
      email: updated.email,
      nickname: updated.nickname,
      role: updated.role,
      suspended: updated.suspended,
    }),
  });
}
