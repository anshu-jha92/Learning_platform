"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookMarked, Trash2, AlertCircle, Languages } from "lucide-react";
import type { LibraryDay } from "@/core/library";
import { apiFetch } from "@/lib/api";

export default function Library() {
  const [days, setDays] = useState<LibraryDay[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/library");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not load your library.");
        return;
      }
      setDays(data.days ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError("Could not reach the server.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(id: string) {
    setRemoving(id);
    try {
      await apiFetch(`/api/library/${id}`, { method: "DELETE" });
      await load();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="min-h-screen text-ink">
      <header className="safe-top glass sticky top-0 z-20">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
          <div>
            <h1 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <BookMarked className="h-4 w-4 text-brand" />
              My library
            </h1>
            <p className="text-[11px] text-muted">
              {total} {total === 1 ? "word" : "words"} you chose to keep
            </p>
          </div>
          <Link href="/" className="btn-ghost flex items-center gap-1.5 px-2.5 py-1.5 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" />
            Practice
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!days && !error && (
          <p className="py-16 text-center text-sm text-muted">Loading...</p>
        )}

        {days && days.length === 0 && (
          <div className="card px-4 py-14 text-center">
            <BookMarked className="mx-auto h-6 w-6 text-line-strong" />
            <p className="mt-3 text-sm text-ink-2">Nothing saved yet.</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
              While you practise, every stronger word the coach suggests has an{" "}
              <span className="font-medium text-ink-2">Add</span> button. Tap it and the
              word lands here with its meaning and a sentence showing where to use it.
            </p>
            <Link href="/" className="btn-primary mt-4 inline-block px-4 py-2 text-sm">
              Go and practise
            </Link>
          </div>
        )}

        <div className="space-y-6">
          {days?.map((day) => (
            <section key={day.date}>
              <h2 className="mb-2 flex items-baseline gap-2">
                <span className="text-sm font-semibold text-ink">{day.label}</span>
                <span className="text-[11px] text-muted">
                  {day.entries.length} {day.entries.length === 1 ? "word" : "words"}
                </span>
              </h2>

              <ul className="space-y-2">
                {day.entries.map((entry) => (
                  <li key={entry.id} className="card rise p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-brand">
                          {entry.word}
                        </p>
                        {entry.hindi && (
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                            <Languages className="h-3 w-3" />
                            {entry.hindi}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => void remove(entry.id)}
                        disabled={removing === entry.id}
                        title="Remove from library"
                        className="shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-raised hover:text-rose-600 disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
                      {entry.meaning}
                    </p>

                    <p className="mt-2 border-l-2 border-brand/30 pl-2.5 text-sm italic leading-relaxed text-ink-2">
                      &ldquo;{entry.example}&rdquo;
                    </p>

                    {entry.context && (
                      <p className="mt-2 text-[11px] text-muted">
                        From your answer: &ldquo;{entry.context}&rdquo;
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
