/**
 * Generates a passcode and writes it into .env.local.
 *
 *   node scripts/set-passcode.mjs            generate one
 *   node scripts/set-passcode.mjs --show     generate one and print it
 *   node scripts/set-passcode.mjs --force    replace an existing passcode
 *
 * Words, not hex. This passcode exists to be read aloud to another person — "amber
 * ladder quartz seven" survives being said across a room in a way that "f3a9c1" does not.
 *
 * Four words from a 64-word list is 2^24 combinations. On its own that is modest, but
 * /api/auth allows 10 attempts per 15 minutes, which puts a brute force well beyond any
 * attacker's patience. It is sized for a passcode you hand to someone, not for one left
 * exposed on the open internet.
 */

import { randomInt } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Deliberately short, unambiguous, easy to say and spell. No homophones.
const WORDS = [
  "amber", "anchor", "basket", "beacon", "cactus", "candle", "canyon", "cedar",
  "cobalt", "comet", "copper", "crystal", "dapper", "delta", "ember", "falcon",
  "fossil", "garden", "granite", "harbor", "hazel", "indigo", "island", "jasmine",
  "jungle", "kettle", "ladder", "lantern", "linen", "marble", "meadow", "mellow",
  "nectar",  "nimble", "nutmeg", "orbit", "otter", "pebble", "pepper", "pilot",
  "quartz", "quiver", "ribbon", "river", "saddle", "sapling", "silver", "sunset",
  "tangle", "temple", "thimble", "timber", "tulip", "umber", "valley", "velvet",
  "walnut", "willow", "window", "winter", "yellow", "yonder", "zenith", "zephyr",
];

function generate() {
  const picked = Array.from({ length: 4 }, () => WORDS[randomInt(WORDS.length)]);
  return `${picked.join("-")}-${randomInt(10, 100)}`;
}

const ENV_FILE = path.join(process.cwd(), ".env.local");
const EXAMPLE = path.join(process.cwd(), ".env.local.example");

const show = process.argv.includes("--show");
const force = process.argv.includes("--force");

let contents = "";
if (existsSync(ENV_FILE)) {
  contents = readFileSync(ENV_FILE, "utf8");
} else if (existsSync(EXAMPLE)) {
  // Start from the documented example so the file explains itself.
  contents = readFileSync(EXAMPLE, "utf8");
}

const existing = contents.match(/^\s*APP_PASSCODE\s*=\s*(\S+)\s*$/m);
if (existing && !force) {
  if (show) {
    // Reading back your own passcode is the common case — you need to tell someone.
    console.log(`\n  Your passcode:  ${existing[1]}\n`);
  } else {
    console.log(
      "A passcode is already set in .env.local.\n" +
        "  npm run passcode -- --show    print it\n" +
        "  npm run passcode -- --force   replace it (signs out every device)"
    );
  }
  process.exit(0);
}

const passcode = generate();

if (/^\s*APP_PASSCODE\s*=.*$/m.test(contents)) {
  contents = contents.replace(/^\s*APP_PASSCODE\s*=.*$/m, `APP_PASSCODE=${passcode}`);
} else {
  contents += `${contents.endsWith("\n") || contents === "" ? "" : "\n"}APP_PASSCODE=${passcode}\n`;
}

writeFileSync(ENV_FILE, contents, "utf8");

console.log("Passcode written to .env.local (gitignored).");
if (show) {
  console.log(`\n  ${passcode}\n`);
} else {
  console.log(
    "Open .env.local to read it, or re-run with --show to print it here.\n" +
      "Restart the dev server for it to take effect."
  );
}
