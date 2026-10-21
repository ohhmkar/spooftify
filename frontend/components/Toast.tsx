"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";

// small confirmation / error pop-ups instead of alert(): toast("Added to X"), toast(message, true) for a failure
const ToastCtx = createContext<(msg: string, bad?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<{ id: number; msg: string; bad: boolean }[]>([]);
  const next = useRef(0);
  const toast = useCallback((msg: string, bad = false) => {
    const id = ++next.current;
    setList((l) => [...l.slice(-2), { id, msg, bad }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), bad ? 6000 : 2800);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 max-md:bottom-36">
        {list.map((t) => (
          <p key={t.id} className={`pointer-events-auto max-w-md rounded-full px-5 py-2.5 text-center text-sm font-medium shadow-xl shadow-black/50 ${t.bad ? "bg-red-600 text-white" : "glass text-white"}`}>{t.msg}</p>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
