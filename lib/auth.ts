import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { AdminUser } from "@prisma/client";

export type AdminSession = {
  id: number;
  email: string;
};

const COOKIE_NAME = "consorcio_session";
const tokenTTL = 60 * 60 * 24 * 7; // 7 days

const getSecretKey = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
};

export async function createSessionCookie(admin: AdminUser): Promise<string> {
  const token = await new SignJWT({ id: admin.id, email: admin.email })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${tokenTTL}s`)
    .sign(getSecretKey());
  return token;
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return {
      id: payload.id as number,
      email: payload.email as string,
    };
  } catch {
    return null;
  }
}

export function setSessionCookie(token: string, res: { cookies: any }) {
  res.cookies.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: tokenTTL,
    path: "/",
  });
}

export function clearSessionCookie(res: { cookies: any }) {
  res.cookies.set({
    name: COOKIE_NAME,
    value: "",
    path: "/",
    httpOnly: true,
    expires: new Date(0),
  });
}
