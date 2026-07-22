import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import type { Role, User } from "@prisma/client";

const COOKIE = "driving_session";

export type SessionUser = {
  id: string;
  email: string;
  nickname: string | null;
  role: Role;
  suspended: boolean;
};

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(s);
}

export async function signToken(user: Pick<User, "id" | "email" | "role">) {
  return new SignJWT({ email: user.email, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, secret());
  const id = payload.sub;
  if (!id) return null;
  return { id, email: String(payload.email ?? ""), role: payload.role as Role };
}

function tokenFromRequest(req?: NextRequest) {
  if (req) return req.cookies.get(COOKIE)?.value ?? null;
  return null;
}

export async function getSessionUser(req?: NextRequest): Promise<SessionUser | null> {
  const token = req
    ? tokenFromRequest(req)
    : (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const payload = await verifyToken(token);
    if (!payload) return null;
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || user.suspended) return null;
    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      role: user.role,
      suspended: user.suspended,
    };
  } catch {
    return null;
  }
}

export function publicUser(user: SessionUser) {
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    role: user.role,
  };
}
