import { NextResponse } from "next/server";
import { CoachError } from "@/core/coach";
import { debriefSession, type TranscriptLine } from "@/core/debrief";
import { analyseText } from "@/core/metrics";
import { applyTurnToProfile } from "@/core/profile";
import { appendTurns, getProfile, saveProfile } from "@/core/store";
import type { Difficulty } from "@/core/scenarios";
import type { TurnRecord } from "@/core/store";

interface IncomingLine extends TranscriptLine {
  /** Only on the learner's lines, measured from the voice-activity events. */
  durationMs?: number;
}

/**
 * Marks a finished live call and folds it into everything else.
 *
 * The per-utterance half of the debrief uses the same coaching contract as typed and
 * spoken turns, so once persisted the dashboard, the learner profile and the review deck
 * pick a live call up with no special handling.
 */
export async function POST(request: Request) {
  let body: {
    scenarioId?: string;
    difficulty?: Difficulty;
    transcript?: IncomingLine[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const transcript = (body.transcript ?? []).filter(
    (l) => (l?.role === "user" || l?.role === "assistant") && typeof l.text === "string"
  );

  if (transcript.length === 0) {
    return NextResponse.json(
      { error: "There was nothing to review — no speech was transcribed." },
      { status: 400 }
    );
  }

  const scenarioId = body.scenarioId ?? "standup";
  const difficulty = body.difficulty ?? "normal";

  try {
    const profile = await getProfile();
    const debrief = await debriefSession(
      scenarioId,
      difficulty,
      transcript.map(({ role, text }) => ({ role, text })),
      profile
    );

    // Match each coached utterance back to its spoken duration so live turns get a real
    // words-per-minute instead of none.
    const durationFor = (text: string): number | undefined => {
      const needle = text.trim().toLowerCase();
      const line = transcript.find(
        (l) => l.role === "user" && l.text.trim().toLowerCase() === needle
      );
      return line?.durationMs && line.durationMs > 0 ? line.durationMs : undefined;
    };

    const at = new Date().toISOString();
    const records: TurnRecord[] = [];
    let updated = profile;

    for (const turn of debrief.turns) {
      const metrics = analyseText(turn.original, durationFor(turn.original));
      updated = applyTurnToProfile(updated, {
        scenarioId,
        errors: turn.coaching.errors,
        fillers: metrics.fillers,
      });
      records.push({
        at,
        scenarioId,
        difficulty,
        userMessage: turn.original,
        // The live reply is audio; the transcript holds what the character said next.
        reply: "",
        coaching: turn.coaching,
        metrics,
      });
    }

    await Promise.all([saveProfile(updated), appendTurns(records)]);

    return NextResponse.json({
      summary: debrief.summary,
      turns: debrief.turns,
      saved: records.length,
    });
  } catch (error) {
    if (error instanceof CoachError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/realtime/debrief]", error);
    return NextResponse.json(
      { error: `Could not review that call: ${detail}` },
      { status: 500 }
    );
  }
}
