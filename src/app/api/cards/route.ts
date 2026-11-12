import { NextResponse } from "next/server";
import { buildDeck, sessionQueue } from "@/core/cards";
import { newCardState, review, type Grade } from "@/core/srs";
import { getCardStates, listTurns, saveCardState } from "@/core/store";

const GRADES: Grade[] = ["again", "hard", "good", "easy"];

/** The deck for this sitting: everything due, plus a capped intake of new cards. */
export async function GET() {
  const [turns, states] = await Promise.all([listTurns(500), getCardStates()]);
  const deck = buildDeck(turns, states);
  return NextResponse.json({
    summary: deck.summary,
    queue: sessionQueue(deck),
  });
}

/** Grade one card and get its new schedule back. */
export async function POST(request: Request) {
  let body: { id?: string; grade?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const id = body.id?.trim();
  const grade = body.grade as Grade | undefined;

  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }
  if (!grade || !GRADES.includes(grade)) {
    return NextResponse.json(
      { error: `grade must be one of ${GRADES.join(", ")}.` },
      { status: 400 }
    );
  }

  try {
    const states = await getCardStates();
    const next = review(states[id] ?? newCardState(id), grade);
    await saveCardState(next);
    return NextResponse.json({ state: next });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/cards]", error);
    return NextResponse.json(
      { error: `Could not save that review: ${detail}` },
      { status: 500 }
    );
  }
}
