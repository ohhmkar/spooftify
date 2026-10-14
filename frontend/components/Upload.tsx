"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@/lib/api";
import { useToast } from "./Toast";

const LIMIT = 4 * 1024 * 1024; // same cap as the API (Vercel rejects bigger bodies anyway)

// picks a file and PUTs it as the raw request body; the backend keeps it in MongoDB (BinData or GridFS)
export function UploadButton({ path, accept, label, onDone }: { path: string; accept: string; label: string; onDone?: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <label className={`rounded-full bg-white/10 px-4 py-2 text-sm font-bold has-focus-visible:ring-2 ${busy ? "opacity-60" : "cursor-pointer hover:bg-white/20"}`}>
      {busy ? "Uploading…" : label}
      <input type="file" accept={accept} disabled={busy} className="sr-only" onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;
        if (f.size > LIMIT) return toast(`That file is ${(f.size / 1048576).toFixed(1)} MB, the limit is 4 MB`, true);
        setBusy(true);
        upload(path, f)
          .then(() => { (onDone ?? router.refresh)(); toast("Uploaded"); })
          .catch((err) => toast(err.message, true))
          .finally(() => setBusy(false));
      }} />
    </label>
  );
}
