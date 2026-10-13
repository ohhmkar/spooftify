// Passwords: scrypt with a random salt. Session: cookie "spoot" = userId.expiry.HMAC (no session table needed).
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from "node:crypto";

export const hashPassword = (pw) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 32).toString("hex")}`;
};
export const checkPassword = (pw, stored) => {
  const [salt, hash] = stored.split(":");
  return !!hash && timingSafeEqual(Buffer.from(hash, "hex"), scryptSync(pw, salt, 32));
};

// ponytail: dev fallback secret, set SESSION_SECRET in backend/.env for anything public
const SECRET = process.env.SESSION_SECRET ?? "spooftify-dev-secret";
const DAYS = 30;
const sign = (payload) => createHmac("sha256", SECRET).update(payload).digest("hex");
export const makeToken = (userId) => {
  const payload = `${userId}.${Date.now() + DAYS * 864e5}`;
  return `${payload}.${sign(payload)}`;
};
export const readToken = (token = "") => {
  const [id, exp, sig] = token.split(".");
  const ok = sig && sig === sign(`${id}.${exp}`) && Date.now() < +exp;
  return ok ? +id : null;
};
export const cookieOptions = { httpOnly: true, sameSite: "lax", path: "/", maxAge: DAYS * 864e5 };
