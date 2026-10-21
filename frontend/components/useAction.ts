"use client";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./Toast";

// run(send(...), "Saved"): on success re-fetch the server components and toast `done`; on failure toast the error. Resolves either way.
export function useAction() {
  const router = useRouter();
  const toast = useToast();
  return useCallback(
    <T,>(p: Promise<T>, done?: string) =>
      p.then((r) => {
        router.refresh();
        if (done) toast(done);
        return r;
      }).catch((e: Error) => void toast(e.message, true)),
    [router, toast],
  );
}
