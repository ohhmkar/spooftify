"use client";
import { useRouter } from "next/navigation";
import { upload } from "@/lib/api";

// picks a file and PUTs it as the raw request body; the backend keeps it in MongoDB (BinData or GridFS)
export function UploadButton({ path, accept, label, onDone }: { path: string; accept: string; label: string; onDone?: () => void }) {
  const router = useRouter();
  return (
    <label className="cursor-pointer rounded-full bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20 has-focus-visible:ring-2">
      {label}
      <input type="file" accept={accept} className="sr-only" onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) upload(path, f).then(() => (onDone ?? router.refresh)()).catch((err) => alert(err.message));
      }} />
    </label>
  );
}
