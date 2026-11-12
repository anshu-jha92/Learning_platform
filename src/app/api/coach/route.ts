import { NextResponse } from "next/server";
import { CoachError, type ChatTurn } from "@/core/coach";
import { processTurn } from "@/core/session";
import type { Difficulty } from "@/core/scenarios";

/**
 * Typed turn. Thin HTTP wrapper — all logic lives in src/core, which imports nothing from
 * Next, so it moves to a standalone API for the mobile build unchanged.
 */
export async function POST(request: Request) {
  let body: {
    scenarioId?: string;
    difficulty?: Difficulty;
    history?: ChatTurn[];
    message?: string;
    conversationId?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "message is required." }, { status: 400 });
  }

  try {
    const result = await processTurn({
      scenarioId: body.scenarioId ?? "standup",
      difficulty: body.difficulty ?? "normal",
      history: Array.isArray(body.history) ? body.history.slice(-12) : [],
      userMessage: message,
      conversationId: body.conversationId,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CoachError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/coach]", error);
    return NextResponse.json({ error: `Coaching failed: ${detail}` }, { status: 500 });
  }
}
