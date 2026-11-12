/**
 * MongoDB for the command-line scripts. The app reads .env.local through Next; plain
 * `node scripts/...` does not, so this loads it the same way — without a dotenv
 * dependency, and without overriding anything already set in the environment.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";

export const DEFAULT_DB = "english_coach";

export function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1] in process.env) continue;
    let value = match[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "");
    process.env[match[1]] = value;
  }
}

/** { client, db } when MONGODB_URI is set, null when it is not. Close the client after. */
export async function openMongo() {
  loadEnvLocal();
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) return null;

  const client = new MongoClient(uri, {
    appName: "english-coach-scripts",
    ignoreUndefined: true,
    serverSelectionTimeoutMS: 15_000,
  });
  try {
    await client.connect();
  } catch (error) {
    await client.close().catch(() => {});
    console.error(
      `Could not connect to MongoDB: ${error.message}\n` +
        "Check MONGODB_URI in .env.local, and that Atlas → Network Access allows this machine's IP address."
    );
    process.exit(1);
  }
  return { client, db: client.db(process.env.MONGODB_DB?.trim() || DEFAULT_DB) };
}
