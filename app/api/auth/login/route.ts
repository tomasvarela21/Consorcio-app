import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { compare } from "bcryptjs";
import { createSessionCookie, setSessionCookie } from "@/lib/auth";

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) {
    return NextResponse.json(
      { message: "Email y contraseña son obligatorios" },
      { status: 400 },
    );
  }

  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin) {
    return NextResponse.json({ message: "Credenciales inválidas" }, { status: 401 });
  }

  const valid = await compare(password, admin.passwordHash);
  if (!valid) {
    return NextResponse.json({ message: "Credenciales inválidas" }, { status: 401 });
  }

  const token = await createSessionCookie(admin);
  const res = NextResponse.json({ ok: true });
  setSessionCookie(token, res);
  return res;
}
