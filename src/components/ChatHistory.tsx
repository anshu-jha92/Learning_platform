"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  Trash2,
  MessageSquare,
  Loader2,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Copy,
  Check,
} from "lucide-react";
import { getScenario } from "@/core/scenarios";
import type { ConversationSummary } from "@/core/conversations";
import { apiFetch } from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  /** The conversation currently on screen, so it can be marked. */
  currentId: string | null;
  onOpenConversation: (id: string) => void;
  /** Called when the open conversation is deleted, so the page can reset. */
  onDeletedCurrent: () => void;
}

function whenLabel(iso: string): string {
  const then = new Date(iso);
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days === 0) {
    return `Today, ${then.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  }
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function ChatHistory({
  open,
  onClose,
  currentId,
  onOpenConversation,
  onDeletedCurrent,
}: Props) {
  const [items, setItems] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/conversations");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not load your history.");
        return;
      }
      setItems(data.conversations ?? []);
    } catch {
      setError("Could not reach the server.");
    }
  }, []);

  // Reload each time it opens: a conversation may have grown since last time.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirming(null);
    setMenuFor(null);
    setRenaming(null);
    void load();
  }, [open, load]);

  // Escape closes the menu first, then the sheet — the usual nesting.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (menuFor) setMenuFor(null);
      else if (renaming) setRenaming(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, menuFor, renaming]);

  useEffect(() => {
    if (renaming) renameRef.current?.focus();
  }, [renaming]);

  async function patch(id: string, body: { title?: string | null; pinned?: boolean }) {
    setBusyId(id);
    try {
      const res = await apiFetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "That did not save.");
        return;
      }
      await load();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusyId(null);
      setMenuFor(null);
      setRenaming(null);
    }
  }

  /** Copies the whole thread as plain text — the only "share" a local app can honestly offer. */
  async function copyConversation(id: string) {
    setBusyId(id);
    setMenuFor(null);
    try {
      const res = await apiFetch(`/api/conversations/${id}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not read that conversation.");
        return;
      }
      const c = data.conversation;
      const text = [
        `${c.title ?? getScenario(c.scenarioId).label} — ${new Date(c.startedAt).toLocaleString()}`,
        "",
        ...c.messages.map(
          (m: { role: string; content: string }) =>
            `${m.role === "user" ? "Me" : getScenario(c.scenarioId).label}: ${m.content}`
        ),
      ].join("\n");

      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Could not copy — your browser may be blocking clipboard access.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    try {
      const res = await apiFetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Could not delete that conversation.");
        return;
      }
      setItems((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
      if (id === currentId) onDeletedCurrent();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusyId(null);
      setConfirming(null);
    }
  }

  if (!open) return null;

  const MENU = [
    { key: "rename", label: "Rename", icon: Pencil },
    { key: "pin", label: "Pin", icon: Pin },
    { key: "copy", label: "Copy text", icon: Copy },
    { key: "delete", label: "Delete", icon: Trash2 },
  ] as const;

  return (
    <div className="fixed inset-0 z-40">
      <button
        aria-label="Close history"
        onClick={onClose}
        className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]"
      />

      <aside className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col bg-surface shadow-2xl">
        <header className="safe-top flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <MessageSquare className="h-4 w-4 text-brand" />
            Past conversations
          </h2>
          <button onClick={onClose} className="btn-ghost p-2" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="safe-bottom flex-1 overflow-y-auto px-4 py-3">
          {error && (
            <p className="mb-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </p>
          )}

          {!items && !error && (
            <p className="py-10 text-center text-sm text-muted">Loading...</p>
          )}

          {items && items.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-sm text-ink-2">Nothing saved yet.</p>
              <p className="mt-1 text-xs text-muted">
                Every practice conversation is kept here once you answer at least once.
              </p>
            </div>
          )}

          <ul className="space-y-2">
            {items?.map((c) => {
              const isCurrent = c.id === currentId;
              const name = c.title ?? getScenario(c.scenarioId).label;

              return (
                <li
                  key={c.id}
                  className={`card relative p-3 transition ${
                    isCurrent ? "border-brand bg-brand-soft" : ""
                  }`}
                >
                  {renaming === c.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void patch(c.id, { title: draftName });
                      }}
                    >
                      <input
                        ref={renameRef}
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        placeholder={getScenario(c.scenarioId).label}
                        maxLength={80}
                        className="field w-full px-2.5 py-1.5 text-xs text-ink"
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          type="submit"
                          disabled={busyId === c.id}
                          className="btn-primary px-2.5 py-1.5 text-xs"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenaming(null)}
                          className="px-2.5 py-1.5 text-xs text-ink-2 hover:text-ink"
                        >
                          Cancel
                        </button>
                      </div>
                      <p className="mt-1.5 text-[11px] text-muted">
                        Leave it empty to go back to the scenario name.
                      </p>
                    </form>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <button
                          onClick={() => {
                            onOpenConversation(c.id);
                            onClose();
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-baseline gap-1.5">
                            {c.pinned && (
                              <Pin className="h-3 w-3 shrink-0 translate-y-0.5 text-brand" />
                            )}
                            <span className="truncate text-xs font-medium text-ink">
                              {name}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-2">
                            {c.preview || "(no answers yet)"}
                          </p>
                          <p className="mt-1.5 text-[11px] text-muted">
                            {whenLabel(c.updatedAt)} · {c.turnCount}{" "}
                            {c.turnCount === 1 ? "answer" : "answers"}
                            {isCurrent && (
                              <span className="ml-1.5 text-brand">· open now</span>
                            )}
                          </p>
                        </button>

                        <button
                          onClick={() => setMenuFor(menuFor === c.id ? null : c.id)}
                          aria-label="More options"
                          className="shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-raised hover:text-ink"
                        >
                          {busyId === c.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : copied === c.id ? (
                            <Check className="h-4 w-4 text-emerald-700" />
                          ) : (
                            <MoreHorizontal className="h-4 w-4" />
                          )}
                        </button>
                      </div>

                      {menuFor === c.id && (
                        <>
                          {/* Clicking anywhere else closes the menu. */}
                          <button
                            aria-hidden="true"
                            tabIndex={-1}
                            onClick={() => setMenuFor(null)}
                            className="fixed inset-0 z-10 cursor-default"
                          />
                          <div className="card-lift absolute right-2 top-10 z-20 w-40 overflow-hidden rounded-xl border border-line bg-surface py-1">
                            {MENU.map((item) => {
                              const isPin = item.key === "pin";
                              const Icon = isPin && c.pinned ? PinOff : item.icon;
                              const label =
                                isPin && c.pinned ? "Unpin" : item.label;

                              return (
                                <button
                                  key={item.key}
                                  onClick={() => {
                                    if (item.key === "rename") {
                                      setDraftName(c.title ?? "");
                                      setRenaming(c.id);
                                      setMenuFor(null);
                                    } else if (isPin) {
                                      void patch(c.id, { pinned: !c.pinned });
                                    } else if (item.key === "copy") {
                                      void copyConversation(c.id);
                                    } else {
                                      setConfirming(c.id);
                                      setMenuFor(null);
                                    }
                                  }}
                                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-xs transition hover:bg-raised ${
                                    item.key === "delete"
                                      ? "text-rose-600"
                                      : "text-ink-2"
                                  }`}
                                >
                                  <Icon className="h-3.5 w-3.5" />
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </>
                  )}

                  {confirming === c.id && (
                    <div className="mt-2.5 rounded-lg border border-rose-300 bg-rose-50 p-2.5">
                      <p className="text-[11px] leading-relaxed text-rose-800">
                        Delete this conversation and the {c.turnCount}{" "}
                        {c.turnCount === 1 ? "answer" : "answers"} in it? Your progress
                        charts and review cards from this session go too. Cannot be
                        undone.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => void remove(c.id)}
                          disabled={busyId === c.id}
                          className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                        >
                          {busyId === c.id && (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          )}
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirming(null)}
                          className="rounded-lg px-2.5 py-1.5 text-xs text-ink-2 hover:text-ink"
                        >
                          Keep it
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </div>
  );
}
