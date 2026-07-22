import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { publicUser, setSessionCookie, signToken } from "@/lib/auth";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "이메일/비밀번호를 확인하세요." }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: "로그인 정보가 올바르지 않습니다." }, { status: 401 });
  }
  if (user.suspended) {
    return NextResponse.json({ error: "정지된 계정입니다." }, { status: 403 });
  }
  const ok = await compare(parsed.data.password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "로그인 정보가 올바르지 않습니다." }, { status: 401 });
  }
  const token = await signToken(user);
  await setSessionCookie(token);
  return NextResponse.json({
    user: publicUser({
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      role: user.role,
      suspended: user.suspended,
    }),
  });
}
