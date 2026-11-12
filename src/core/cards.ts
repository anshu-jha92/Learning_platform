import type { TurnRecord } from "./store";
import { hashId, truncate } from "./text";
import { isDue, newCardState, type CardState } from "./srs";

/**
 * The deck is DERIVED from your practice history, never authored.
 *
 * Every correction and vocabulary upgrade the coach gave you becomes a card, deduplicated
 * so a mistake you made nine times is one card you see often — not nine cards. Card ids are
 * content hashes, so regenerating the deck keeps every card's review schedule intact.
 */

export type CardKind = "fix" | "vocab" | "rephrase";

export interface Card {
  id: string;
  kind: CardKind;
  /** What you are shown first. */
  front: string;
  /** The answer. */
  back: string;
  note?: string;
  /** Where this came from, for context on the answer side. */
  context?: string;
  /** What a spoken attempt is compared against. */
  target: string;
  /** How many times you have made this mistake. */
  seenCount: number;
  lastSeenAt: string;
}

export interface DeckCard extends Card {
  state: CardState;
  due: boolean;
  isNew: boolean;
}

export const KIND_LABEL: Record<CardKind, string> = {
  fix: "Fix the mistake",
  vocab: "Stronger word",
  rephrase: "Say it better",
};

export const KIND_PROMPT: Record<CardKind, string> = {
  fix: "What is wrong here, and what should it be?",
  vocab: "What is a sharper, more professional word?",
  rephrase: "Say this the way a confident native professional would.",
};

function upsert(map: Map<string, Card>, card: Card) {
  const existing = map.get(card.id);
  if (existing) {
    existing.seenCount += 1;
    if (card.lastSeenAt > existing.lastSeenAt) {
      existing.lastSeenAt = card.lastSeenAt;
      existing.context = card.context;
    }
  } else {
    map.set(card.id, card);
  }
}

export function buildCards(turns: TurnRecord[]): Card[] {
  const map = new Map<string, Card>();

  for (const turn of turns) {
    const context = truncate(turn.userMessage, 180);

    for (const err of turn.coaching.errors) {
      if (!err.original.trim() || !err.fix.trim()) continue;
      upsert(map, {
        id: `fix:${hashId(`${err.original}|${err.fix}`)}`,
        kind: "fix",
        front: err.original,
        back: err.fix,
        note: err.why,
        context,
        target: err.fix,
        seenCount: 1,
        lastSeenAt: turn.at,
      });
    }

    for (const v of turn.coaching.vocab_upgrades) {
      if (!v.you_said.trim() || !v.try.trim()) continue;
      upsert(map, {
        id: `vocab:${hashId(`${v.you_said}|${v.try}`)}`,
        kind: "vocab",
        front: v.you_said,
        back: v.try,
        note: v.note,
        context,
        target: v.try,
        seenCount: 1,
        lastSeenAt: turn.at,
      });
    }

    // Only worth drilling the whole sentence when something was actually wrong with it.
    const best = turn.coaching.better_phrasings[0];
    if (best && turn.coaching.errors.length > 0) {
      upsert(map, {
        id: `rephrase:${hashId(turn.userMessage)}`,
        kind: "rephrase",
        front: turn.userMessage,
        back: best,
        note: turn.coaching.register_note,
        target: best,
        seenCount: 1,
        lastSeenAt: turn.at,
      });
    }
  }

  return [...map.values()].sort((a, b) => b.seenCount - a.seenCount);
}

export interface DeckSummary {
  dueCount: number;
  newCount: number;
  totalCount: number;
}

export interface Deck {
  cards: DeckCard[];
  summary: DeckSummary;
}

/** How many unseen cards to introduce per session — enough to learn, not enough to drown. */
export const NEW_PER_SESSION = 10;

export function buildDeck(
  turns: TurnRecord[],
  states: Record<string, CardState>,
  now = new Date()
): Deck {
  const cards = buildCards(turns);

  const decorated: DeckCard[] = cards.map((card) => {
    const state = states[card.id] ?? newCardState(card.id);
    return {
      ...card,
      state,
      due: isDue(state, now),
      isNew: state.reps === 0 && state.lastReviewed === null,
    };
  });

  return {
    cards: decorated,
    summary: {
      dueCount: decorated.filter((c) => c.due && !c.isNew).length,
      newCount: decorated.filter((c) => c.isNew).length,
      totalCount: decorated.length,
    },
  };
}

/**
 * The queue for one sitting: everything genuinely due, plus a capped intake of new cards.
 * Mistakes you make most often come first.
 */
export function sessionQueue(deck: Deck, newLimit = NEW_PER_SESSION): DeckCard[] {
  const due = deck.cards
    .filter((c) => c.due && !c.isNew)
    .sort((a, b) => new Date(a.state.due).getTime() - new Date(b.state.due).getTime());

  const fresh = deck.cards
    .filter((c) => c.isNew)
    .sort((a, b) => b.seenCount - a.seenCount)
    .slice(0, newLimit);

  return [...due, ...fresh];
}
