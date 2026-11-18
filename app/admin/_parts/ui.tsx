"use client";

// Bagian bersama halaman admin: panggilan API (password admin lewat header), kartu, format angka/tanggal.
import { useCallback } from "react";

export const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
export const fmtDay = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" });
export const num = (n: number | null | undefined) => (n ?? 0).toLocaleString("id-ID");
export const rupiah = (n: number | null | undefined) => `Rp${num(n)}`;

export const btn = "rounded-full bg-gradient-to-r from-[#0B2A5B] to-[#1A73E8] px-5 text-sm font-medium text-white disabled:opacity-50";
export const btnOutline = "rounded-full border px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-50";

export function useApi(password: string) {
  return useCallback(async <T,>(path: string, body?: unknown): Promise<T> => {
    const res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "x-admin-password": password, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Gagal (${res.status})`);
    return data as T;
  }, [password]);
}

export function Card({ children, title, action }: { children: React.ReactNode; title?: string; action?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      {(title || action) && <div className="mb-3 flex flex-wrap items-center gap-2">{title && <h2 className="text-lg font-semibold">{title}</h2>}<div className="ml-auto">{action}</div></div>}
      {children}
    </section>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: readonly (readonly [T, string])[] }) {
  return (
    <div className="inline-flex rounded-full border bg-white p-0.5">
      {options.map(([id, label]) => (
        <button key={id} onClick={() => onChange(id)} className={`rounded-full px-3 py-1 text-sm ${value === id ? "bg-[#0B2A5B] text-white" : "text-slate-600"}`}>{label}</button>
      ))}
    </div>
  );
}
