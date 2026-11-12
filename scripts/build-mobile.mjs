/**
 * Builds the static bundle for the native shell.
 *
 *   NEXT_PUBLIC_API_BASE_URL=https://your-api.example.com npm run mobile:bundle
 *
 * Next cannot static-export an app that has POST route handlers — it fails with
 * "export const dynamic = force-static not configured on route". So this script takes the
 * API out of the router for the duration of the export.
 *
 * It renames the individual route.ts FILES rather than the api/ directory. On Windows a
 * running dev server holds a watch handle on the directory, and renaming a watched
 * directory fails with EPERM — but renaming files inside it is allowed. Everything is
 * restored in a finally block, and a startup sweep repairs a run that was killed outright.
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, renameSync, statSync } from "node:fs";
import path from "node:path";

const API_DIR = path.join(process.cwd(), "src", "app", "api");
const SUFFIX = ".export-disabled";

/** Every file under a directory, recursively. */
function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function routeFiles() {
  return walk(API_DIR).filter((f) => /[\\/]route\.tsx?$/.test(f));
}

function disabledFiles() {
  return walk(API_DIR).filter((f) => f.endsWith(SUFFIX));
}

function restoreAll() {
  for (const file of disabledFiles()) {
    const original = file.slice(0, -SUFFIX.length);
    if (!existsSync(original)) renameSync(file, original);
  }
}

// Repair a previous run that never reached its finally block.
restoreAll();

if (!existsSync(API_DIR)) {
  console.error("Could not find src/app/api — run this from the project root.");
  process.exit(1);
}

if (!process.env.NEXT_PUBLIC_API_BASE_URL) {
  console.error(
    "\nNEXT_PUBLIC_API_BASE_URL is not set.\n\n" +
      "A bundled app has no server of its own, so it needs a hosted API to call:\n\n" +
      "  NEXT_PUBLIC_API_BASE_URL=https://your-api.example.com npm run mobile:bundle\n\n" +
      "Or use server mode instead, which needs no bundle at all:\n\n" +
      "  MOBILE_SERVER_URL=http://192.168.1.50:3000 npm run mobile:sync\n"
  );
  process.exit(1);
}

console.log(
  `Building static bundle against API ${process.env.NEXT_PUBLIC_API_BASE_URL}`
);

const hidden = [];
try {
  for (const file of routeFiles()) {
    renameSync(file, file + SUFFIX);
    hidden.push(file);
  }
  console.log(`Hid ${hidden.length} API route(s) from the export`);

  execSync("npx next build", {
    stdio: "inherit",
    env: { ...process.env, MOBILE_EXPORT: "1" },
  });
} finally {
  restoreAll();
  console.log(`Restored ${hidden.length} API route(s)`);
}

execSync("npx cap sync android", { stdio: "inherit" });
console.log("\nBundle synced. Open the Android project with: npm run mobile:open");
