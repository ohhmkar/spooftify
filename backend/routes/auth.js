// accounts: the session middleware (req.user) runs for every route mounted after this router
import express from "express";
import { tables } from "../models.js";
import { hashPassword, checkPassword, makeToken, readToken, cookieOptions } from "../auth.js";
import { tx } from "../lib.js";

const api = express.Router();
export default api;

// ---------- SESSION: cookie "spoot" is set by login/signup; req.user = user_id or null ----------
const cookieOf = (req, name) => req.headers.cookie?.split("; ").find((c) => c.startsWith(name + "="))?.slice(name.length + 1);
api.use((req, res, next) => {
  req.user = readToken(cookieOf(req, "spoot"));
  next();
});
const session = (res, id) => res.cookie("spoot", makeToken(id), cookieOptions);

api.post("/auth/signup", tx(async (req, res) => {
  const { user_name, email, phone, password } = req.body;
  if (!password || password.length < 6) throw new Error("Password must be at least 6 characters");
  const u = await tables.User.create({ user_name, email, phone: Number(phone), password_hash: hashPassword(password) });
  session(res, u._id);
  res.status(201).json({ user_id: u._id, user_name: u.user_name });
}));
api.post("/auth/login", async (req, res) => {
  const u = await tables.User.findOne({ email: String(req.body.email ?? "").toLowerCase() });
  if (!u || !checkPassword(String(req.body.password ?? ""), u.password_hash)) return res.status(401).json({ error: "Wrong email or password" });
  session(res, u._id);
  res.json({ user_id: u._id, user_name: u.user_name });
});
api.post("/auth/logout", (req, res) => res.clearCookie("spoot", { path: "/" }).json({ ok: true }));
api.get("/me", async (req, res) => {
  const u = req.user && (await tables.User.findById(req.user, "user_name email"));
  res.json(u ? { user_id: u._id, user_name: u.user_name, email: u.email } : null);
});
