import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { verifyPassword } from "@/lib/auth/password";
import { cookieOptions, createSessionToken, SESSION_COOKIE } from "@/lib/auth/session";

const sameString = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function POST(request: Request) {
  const form = await request.formData();
  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");
  const expectedUser = process.env.AUTH_USERNAME ?? "";
  const hash = process.env.AUTH_PASSWORD_HASH ?? "";
  const back = (q: string) => NextResponse.redirect(new URL(`/login?${q}`, request.url), 303);

  if (!expectedUser || !hash || !process.env.SESSION_SECRET) return back("error=config");
  const userOk = sameString(username, expectedUser);
  const passOk = await verifyPassword(password, hash); // always runs, so timing does not reveal the username
  if (!userOk || !passOk) {
    await new Promise((r) => setTimeout(r, 750));
    return back("error=invalid");
  }
  const res = NextResponse.redirect(new URL("/", request.url), 303);
  res.cookies.set(SESSION_COOKIE, await createSessionToken(expectedUser), cookieOptions);
  return res;
}
