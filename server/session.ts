import { SignJWT, jwtVerify } from "jose";
import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const.js";
import { ENV } from "./_core/env.js";

const getSecret = () => {
  if (!ENV.cookieSecret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return new TextEncoder().encode(ENV.cookieSecret);
};

export async function createSessionToken(openId: string, name: string) {
  return await new SignJWT({
    openId,
    name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ONE_YEAR_MS / 1000)
    .sign(getSecret());
}

export async function verifySessionToken(token: string) {
  const { payload } = await jwtVerify(token, getSecret());
  return payload as { openId: string; name?: string };
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
