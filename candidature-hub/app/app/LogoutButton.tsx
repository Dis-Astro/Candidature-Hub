"use client";
import { useRouter } from "next/navigation";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  return <button className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900" onClick={async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login"); router.refresh();
  }}>{compact ? "Esci" : "Esci"}</button>;
}
