"use client";

import { useState } from "react";
import { Plus, Check, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface Props {
  word: string;
  /** What you had said in Hindi, when this came from Hinglish mode. */
  hindi?: string;
  /** The sentence it came out of — steers the meaning and example. */
  context?: string;
  source: "coaching" | "translation";
}

/**
 * Saves one word to the library.
 *
 * The meaning and example are generated server-side on the way in, so this takes a
 * moment — hence the spinner. Once saved it stays ticked rather than offering to add
 * the same word again, and adding a duplicate is answered from storage without
 * spending another model call.
 */
export function AddToLibrary({ word, hindi, context, source }: Props) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function add() {
    if (state === "saving" || state === "saved") return;
    setState("saving");
    try {
      const res = await apiFetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, hindi, context, source }),
      });
      setState(res.ok ? "saved" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "saved") {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
        title="In your library"
      >
        <Check className="h-3 w-3" />
        Saved
      </span>
    );
  }

  return (
    <button
      onClick={() => void add()}
      disabled={state === "saving"}
      title={state === "error" ? "Could not save — tap to retry" : "Add to my library"}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition ${
        state === "error"
          ? "border-rose-300 text-rose-700 hover:bg-rose-50"
          : "border-line text-muted hover:border-brand hover:text-brand"
      }`}
    >
      {state === "saving" ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Plus className="h-3 w-3" />
      )}
      {state === "error" ? "Retry" : "Add"}
    </button>
  );
}
