"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { send } from "@/lib/api";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const signup = mode === "signup";
  const field = "w-full rounded bg-raised px-3 py-3 outline-none ring-1 ring-white/20 focus:ring-2 focus:ring-white";
  return (
    <form
      className="mx-auto flex max-w-sm flex-col gap-3 px-4 py-12"
      onSubmit={(e) => {
        e.preventDefault();
        send("POST", `/auth/${mode}`, Object.fromEntries(new FormData(e.currentTarget)))
          .then(() => { router.push("/"); router.refresh(); })
          .catch((e) => setErr(e.message));
      }}
    >
      <h1 className="mb-4 text-4xl font-black">{signup ? "Sign up for Spootify" : "Log in to Spootify"}</h1>
      {signup && <input name="user_name" required maxLength={20} placeholder="Username" aria-label="Username" className={field} />}
      <input name="email" type="email" required placeholder="Email" aria-label="Email" className={field} />
      {signup && <input name="phone" required pattern="\d{10}" title="10 digit phone number" placeholder="Phone (10 digits)" aria-label="Phone" className={field} />}
      <input name="password" type="password" required minLength={6} placeholder="Password" aria-label="Password" className={field} />
      {err && <p className="rounded bg-red-500/20 p-2 text-sm text-red-300">{err}</p>}
      <button className="mt-2 rounded-full bg-accent py-3 font-bold text-black hover:scale-[1.02]">{signup ? "Sign up" : "Log in"}</button>
      <p className="text-center text-sm text-muted">
        {signup ? "Have an account?" : "No account?"}{" "}
        <Link href={signup ? "/login" : "/signup"} className="text-white underline">{signup ? "Log in" : "Sign up"}</Link>
      </p>
    </form>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button onClick={() => send("POST", "/auth/logout").then(() => { router.push("/"); router.refresh(); })} className="shrink-0 rounded-full bg-white px-5 py-3 font-bold text-black hover:scale-105">
      Log out
    </button>
  );
}

export function FollowButton({ kind, id, following, loggedIn }: { kind: "artist" | "user" | "playlist"; id: number; following: boolean; loggedIn: boolean }) {
  const router = useRouter();
  return (
    <button
      aria-pressed={following}
      onClick={() => (loggedIn ? send(following ? "DELETE" : "PUT", `/follow/${kind}/${id}`).then(() => router.refresh()).catch((e) => alert(e.message)) : router.push("/login"))}
      className="rounded-full border border-white/40 px-5 py-2 text-sm font-bold hover:scale-105 hover:border-white"
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
