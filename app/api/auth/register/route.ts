import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { publicUser, setSessionCookie, signToken } from "@/lib/auth";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(72),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "이메일/비밀번호를 확인하세요." }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "이미 가입된 이메일입니다." }, { status: 409 });
  }
  const passwordHash = await hash(parsed.data.password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash },
  });
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
