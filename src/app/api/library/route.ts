import { NextResponse } from "next/server";
import { CoachError } from "@/core/coach";
import { entryId, enrich, groupByDay, type LibraryEntry } from "@/core/library";
import { addLibraryEntry, getLibrary } from "@/core/store";

/** The library, newest day first. */
export async function GET() {
  const entries = await getLibrary();
  return NextResponse.json({ days: groupByDay(entries), total: entries.length });
}

/** Add a word. The meaning and example are generated here, once, on the way in. */
export async function POST(request: Request) {
  let body: {
    word?: string;
    hindi?: string;
    context?: string;
    source?: LibraryEntry["source"];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const word = body.word?.trim();
  if (!word) {
    return NextResponse.json({ error: "word is required." }, { status: 400 });
  }

  // Already saved? Say so without spending a model call on it again.
  const existing = (await getLibrary()).find((e) => e.id === entryId(word));
  if (existing) {
    return NextResponse.json({ added: false, entry: existing });
  }

  try {
    const { meaning, example } = await enrich(word, body.context);
    const result = await addLibraryEntry({
      id: entryId(word),
      word,
      meaning,
      example,
      ...(body.hindi ? { hindi: body.hindi } : {}),
      ...(body.context ? { context: body.context } : {}),
      source: body.source ?? "manual",
      addedAt: new Date().toISOString(),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CoachError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/library]", error);
    return NextResponse.json(
      { error: `Could not add that word: ${detail}` },
      { status: 500 }
    );
  }
}
