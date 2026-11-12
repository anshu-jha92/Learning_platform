"use client";

import { Languages, ArrowRight, Mic } from "lucide-react";
import type { Translation } from "@/core/translate";
import { AddToLibrary } from "@/components/AddToLibrary";

interface Props {
  translation: Translation;
  /** Drops the English into the input so it can be said properly, and coached. */
  onPractice: (english: string) => void;
}

/**
 * The result of saying something in Hindi.
 *
 * The "practice this" button is the point of the card, not decoration: reading a
 * translation teaches very little, and saying it out loud in the next turn puts it
 * through the normal coaching loop. The card is a step, not an answer.
 */
export function TranslationCard({ translation, onPractice }: Props) {
  return (
    <div className="card rise mt-2.5 overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-line bg-brand-soft px-3.5 py-2">
        <Languages className="h-3.5 w-3.5 text-brand" />
        <span className="text-xs font-medium text-brand-ink">Say it like this</span>
      </div>

      <div className="space-y-4 px-3.5 py-3">
        <div>
          <p className="text-base font-medium leading-relaxed text-ink">
            {translation.english}
          </p>
          <button
            onClick={() => onPractice(translation.english)}
            className="btn-primary mt-2.5 flex items-center gap-1.5 px-3 py-1.5 text-xs"
          >
            <Mic className="h-3.5 w-3.5" />
            Practice saying this
          </button>
        </div>

        {translation.alternatives.length > 0 && (
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Or
            </h4>
            <ul className="mt-1 space-y-1.5">
              {translation.alternatives.map((alt, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-line-strong" />
                  <button
                    onClick={() => onPractice(alt)}
                    className="text-left text-sm leading-relaxed text-ink-2 transition hover:text-brand"
                  >
                    {alt}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {translation.phrases.length > 0 && (
          <div className="border-t border-line pt-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Worth remembering
            </h4>
            <ul className="mt-2 space-y-2">
              {translation.phrases.map((p, i) => (
                <li key={i}>
                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className="text-ink-2">{p.hindi}</span>
                    <ArrowRight className="h-3 w-3 shrink-0 text-muted" />
                    <span className="font-medium text-brand">{p.english}</span>
                    <AddToLibrary
                      word={p.english}
                      hindi={p.hindi}
                      context={translation.english}
                      source="translation"
                    />
                  </div>
                  {p.note && (
                    <p className="mt-0.5 text-[11px] text-muted">{p.note}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
