import { NextResponse } from "next/server";
import { CoachError } from "@/core/coach";
import {
  generateTest,
  gradeTest,
  type TestAnswer,
  type TestAttempt,
} from "@/core/test";
import {
  getLibrary,
  listTestAttempts,
  listTurns,
  saveTestAttempt,
} from "@/core/store";

/** Build this week's test from the last six days of practice. */
export async function GET() {
  try {
    const [turns, library, attempts] = await Promise.all([
      listTurns(500),
      getLibrary(),
      listTestAttempts(),
    ]);

    // Demo turns are invented; testing someone on mistakes they never made is pointless.
    const real = turns.filter((t) => !t.demo);
    const test = await generateTest(real, library);

    return NextResponse.json({ ...test, past: attempts.slice(0, 8) });
  } catch (error) {
    if (error instanceof CoachError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/test GET]", error);
    return NextResponse.json(
      { error: `Could not build your test: ${detail}` },
      { status: 500 }
    );
  }
}

/** Mark the whole thing in one go and keep the score. */
export async function POST(request: Request) {
  let body: { answers?: TestAnswer[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const answers = body.answers ?? [];
  if (answers.length === 0) {
    return NextResponse.json({ error: "There are no answers to mark." }, { status: 400 });
  }

  try {
    const graded = await gradeTest(answers);

    const attempt: TestAttempt = {
      id: `t${Date.now().toString(36)}`,
      takenAt: new Date().toISOString(),
      percentage: graded.percentage,
      band: graded.band,
      scored: graded.scored,
      outOf: graded.outOf,
      summary: graded.summary,
      focus: graded.focus,
    };
    await saveTestAttempt(attempt);

    return NextResponse.json({ ...graded, attemptId: attempt.id });
  } catch (error) {
    if (error instanceof CoachError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/test POST]", error);
    return NextResponse.json(
      { error: `Could not mark your test: ${detail}` },
      { status: 500 }
    );
  }
}
