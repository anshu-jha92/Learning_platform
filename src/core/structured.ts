import type OpenAI from "openai";
import type { ZodType } from "zod";
import { CoachError } from "./coach";
import { explainModelError } from "./models";

/**
 * Structured output that survives a provider which does not support it.
 *
 * OpenAI guarantees a response matching a JSON Schema via `strict: true`. Most
 * OpenAI-compatible providers (Gemini, Groq, OpenRouter, Ollama) implement some of that
 * and reject the rest, and each rejects it differently. Rather than pick one and hope,
 * this walks down three rungs:
 *
 *   1. strict json_schema    — guaranteed shape (OpenAI, and providers that implement it)
 *   2. json_object           — guaranteed JSON, shape asked for in the prompt
 *   3. plain text            — JSON dug out of whatever came back
 *
 * Every rung ends at the same zod validator, so a wrong shape fails the same way it
 * always did. The fallbacks lose the guarantee, not the checking.
 */

export interface StructuredRequest<T> {
  client: OpenAI;
  model: string;
  temperature?: number;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  /** Name for the schema, as the strict API wants it. */
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  validator: ZodType<T>;
}

/** A model that cannot do a mode usually says so with a 4xx, not a 5xx. */
function looksUnsupported(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  if (typeof status === "number" && status >= 400 && status < 500) return true;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("response_format") ||
    message.includes("json_schema") ||
    message.includes("not supported") ||
    message.includes("unsupported") ||
    message.includes("invalid_request")
  );
}

/**
 * Models in JSON-ish modes like to wrap the object in a markdown fence, or add a
 * sentence before it. Take the outermost {...} and ignore the rest.
 */
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : raw).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

function parseAndValidate<T>(raw: string, validator: ZodType<T>, rung: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    throw new CoachError(`The model did not return valid JSON (${rung}).`);
  }

  const result = validator.safeParse(parsed);
  if (!result.success) {
    throw new CoachError(
      `The response did not match the expected shape (${rung}): ${result.error.issues
        .map((i) => `${i.path.join(".")} ${i.message}`)
        .join("; ")}`
    );
  }
  return result.data;
}

/** Spells the schema out in the prompt, for providers that cannot be handed one. */
function withSchemaInPrompt(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  jsonSchema: Record<string, unknown>
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const instruction = `\n\n== OUTPUT FORMAT ==
Reply with a single JSON object and nothing else — no prose, no markdown fence.
It must match this JSON Schema exactly, including every required field:

${JSON.stringify(jsonSchema)}`;

  const [first, ...rest] = messages;
  if (first?.role === "system" && typeof first.content === "string") {
    return [{ ...first, content: first.content + instruction }, ...rest];
  }
  return [{ role: "system", content: instruction.trim() }, ...messages];
}

function contentOf(completion: OpenAI.Chat.ChatCompletion, rung: string): string {
  const choice = completion.choices[0];
  if (choice?.message?.refusal) {
    throw new CoachError(`The model refused: ${choice.message.refusal}`);
  }
  const raw = choice?.message?.content;
  if (!raw) throw new CoachError(`The model returned an empty response (${rung}).`);
  return raw;
}

export async function requestStructured<T>(req: StructuredRequest<T>): Promise<T> {
  const { client, model, temperature, messages, schemaName, jsonSchema, validator } = req;
  const base = { model, ...(temperature === undefined ? {} : { temperature }) };

  // Rung 1 — a guaranteed shape, when the provider can give one.
  try {
    const completion = await client.chat.completions.create({
      ...base,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: { name: schemaName, strict: true, schema: jsonSchema },
      },
    });
    return parseAndValidate(contentOf(completion, "strict"), validator, "strict");
  } catch (error) {
    // A shape mismatch is the model's fault, not the provider's — do not retry it.
    if (error instanceof CoachError) throw error;
    // A model the provider does not have is not an unsupported mode: stepping down a
    // rung cannot help, and the 404 names the variable to fix.
    const missing = explainModelError(error, "OPENAI_MODEL");
    if (missing) throw missing;
    if (!looksUnsupported(error)) throw error;
  }

  const prompted = withSchemaInPrompt(messages, jsonSchema);

  // Rung 2 — guaranteed JSON, shape only asked for.
  try {
    const completion = await client.chat.completions.create({
      ...base,
      messages: prompted,
      response_format: { type: "json_object" },
    });
    return parseAndValidate(contentOf(completion, "json mode"), validator, "json mode");
  } catch (error) {
    if (error instanceof CoachError) throw error;
    // A model the provider does not have is not an unsupported mode: stepping down a
    // rung cannot help, and the 404 names the variable to fix.
    const missing = explainModelError(error, "OPENAI_MODEL");
    if (missing) throw missing;
    if (!looksUnsupported(error)) throw error;
  }

  // Rung 3 — nothing guaranteed; dig the JSON out of plain text.
  const completion = await client.chat.completions.create({
    ...base,
    messages: prompted,
  });
  return parseAndValidate(contentOf(completion, "plain text"), validator, "plain text");
}
