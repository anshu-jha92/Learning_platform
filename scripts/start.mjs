/**
 * Production start, with one safety net.
 *
 * `next start` refuses to run without a build and says so with a generic message. That
 * is exactly what happens on a host that was set up to install and start but never to
 * build — Render's default for a manually created Web Service does precisely that, and
 * the deploy dies in a crash loop with nothing pointing at the real cause.
 *
 * So: if the build is missing, build it here rather than failing. It costs a minute on
 * the first boot and nothing afterwards, because .next survives for the life of the
 * instance. The warning below still names the proper fix, so this does not quietly hide
 * a misconfigured host.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const BUILD_ID = path.join(process.cwd(), ".next", "BUILD_ID");

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: true });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))
    );
    child.on("error", reject);
  });
}

if (!existsSync(BUILD_ID)) {
  console.warn(
    "\n  No production build found, so one is being made now.\n" +
      "  This works, but it belongs in the build step. On Render, set:\n" +
      "      Build Command:  npm ci && npm run build\n" +
      "      Start Command:  npm start\n" +
      "  Otherwise every fresh instance pays for this build again.\n"
  );
  await run("npx", ["next", "build"]);
}

// Render supplies PORT; next start reads it.
await run("npx", ["next", "start"]);
