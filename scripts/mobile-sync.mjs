/**
 * Syncs the native shell in SERVER MODE.
 *
 *   MOBILE_SERVER_URL=http://192.168.1.50:3000 npm run mobile:sync
 *
 * The shell loads the live app over the network, so there is no bundle to build — but
 * Capacitor still requires webDir to exist and copies it into the app. That copy becomes
 * the screen you see when the server is unreachable, so it is worth making it say
 * something useful rather than shipping a blank page.
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const OUT = path.join(process.cwd(), "out");
const INDEX = path.join(OUT, "index.html");

const serverUrl = process.env.MOBILE_SERVER_URL;
if (!serverUrl) {
  console.error(
    "\nMOBILE_SERVER_URL is not set.\n\n" +
      "Point it at a reachable instance — your dev machine's LAN address, not localhost,\n" +
      "because localhost on the phone means the phone itself:\n\n" +
      "  MOBILE_SERVER_URL=http://192.168.1.50:3000 npm run mobile:sync\n\n" +
      "Start the dev server with `npm run dev -- -H 0.0.0.0` so the phone can reach it.\n"
  );
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

// Only write the fallback if there is no real bundle sitting there.
const isRealBundle = existsSync(path.join(OUT, "_next"));
if (!isRealBundle) {
  writeFileSync(
    INDEX,
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Meeting English Coach</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f9f9f7;
        color: #0b0b0b;
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        text-align: center;
        padding: 2rem;
      }
      p { color: #52514e; font-size: 0.875rem; line-height: 1.6; max-width: 22rem; }
      code { color: #2a78d6; }
    </style>
  </head>
  <body>
    <div>
      <h1 style="font-size:1rem">Cannot reach the coach</h1>
      <p>
        This build loads the app from <code>${serverUrl}</code>.
        Check that the server is running and that this phone is on the same network.
      </p>
    </div>
  </body>
</html>
`,
    "utf8"
  );
  console.log("Wrote offline fallback to out/index.html");
}

execSync("npx cap sync android", { stdio: "inherit" });
console.log(`\nSynced. The app will load ${serverUrl}`);
console.log("Open the Android project with: npm run mobile:open");
