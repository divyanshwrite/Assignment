"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Check, Copy, LinkIcon, ShieldCheck } from "lucide-react";
import { createShareLink, fetchAssignment, listShareLinks } from "@/lib/api";
import type { Assignment } from "@/lib/types";

interface ShareEntry {
  token: string;
  expiresAt: string;
  createdAt: string;
}

const TTL_OPTIONS = [
  { label: "1 hour", value: 1 },
  { label: "24 hours", value: 24 },
  { label: "7 days", value: 24 * 7 },
  { label: "30 days", value: 24 * 30 }
];

export default function SharePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [ttl, setTtl] = useState(24 * 7);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string>("");

  async function reload() {
    try {
      const [a, s] = await Promise.all([fetchAssignment(id), listShareLinks(id)]);
      setAssignment(a);
      setShares(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load share data.");
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function create() {
    setCreating(true);
    setError("");
    try {
      await createShareLink(id, ttl);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create share link.");
    } finally {
      setCreating(false);
    }
  }

  function shareUrl(token: string) {
    if (typeof window === "undefined") return `/share/${token}`;
    return `${window.location.origin}/share/${token}`;
  }

  async function copy(token: string) {
    const url = shareUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(token);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="max-w-[760px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link href="/" className="flex items-center gap-2 text-slate-700 font-bold hover:text-slate-900">
            <ArrowLeft size={16} />
            Back
          </Link>
          <Link
            href={`/assignments/${id}/answer-key`}
            className="text-[12.5px] font-bold text-slate-600 hover:text-slate-900"
          >
            View answer key →
          </Link>
        </div>

        <header className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm mb-5">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-700">
            Share assignment
          </p>
          <h1 className="text-2xl font-extrabold mt-1">{assignment?.title || "Loading..."}</h1>
          <p className="text-slate-500 text-sm mt-1 flex items-center gap-2">
            <ShieldCheck size={14} className="text-emerald-600" />
            Read-only public link · No teacher prompt or source content is exposed.
          </p>
        </header>

        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm mb-5">
          <h2 className="font-extrabold mb-3">Generate new link</h2>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] font-bold text-slate-700">
              Expires in
              <select
                value={ttl}
                onChange={(e) => setTtl(Number(e.target.value))}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold"
              >
                {TTL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={create}
              disabled={creating}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-full px-4 py-2 text-sm"
            >
              <LinkIcon size={15} />
              {creating ? "Creating..." : "Create link"}
            </button>
          </div>
          {error ? <p className="text-rose-600 text-[12.5px] mt-2 font-bold">{error}</p> : null}
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="font-extrabold mb-3">Active links</h2>
          {shares.length === 0 ? (
            <p className="text-slate-500 text-sm">No share links yet.</p>
          ) : (
            <ul className="flex flex-col gap-3 list-none p-0 m-0">
              {shares.map((s) => {
                const url = shareUrl(s.token);
                const expired = new Date(s.expiresAt).getTime() < Date.now();
                return (
                  <li
                    key={s.token}
                    className="flex flex-col gap-1.5 border border-slate-200 rounded-xl p-3 bg-slate-50/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <code className="font-mono text-[12.5px] text-slate-700 truncate">{url}</code>
                      <button
                        onClick={() => copy(s.token)}
                        className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-full px-2.5 py-1 text-[12px] font-bold hover:bg-slate-50"
                      >
                        {copied === s.token ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                        {copied === s.token ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-[11.5px] text-slate-500">
                      <span>Created {new Date(s.createdAt).toLocaleString()}</span>
                      <span className={expired ? "text-rose-600 font-bold" : ""}>
                        {expired ? "Expired" : `Expires ${new Date(s.expiresAt).toLocaleString()}`}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
