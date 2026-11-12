/**
 * Dev server wrapper.
 *
 *   npm run dev                 localhost only (default)
 *   npm run dev -- --host       also reachable from other devices on your network
 *
 * `--host` is Vite's flag; Next wants `-H 0.0.0.0`. This translates it, then prints the
 * LAN address so there is a link to copy rather than an IP to go hunting for.
 *
 * The share block is printed only AFTER Next reports the port it actually bound. Next
 * silently falls back to 3001 when 3000 is taken, and a confidently printed link to the
 * wrong port is worse than no link at all.
 */

import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);

// Accept the Vite spelling, and a couple of obvious variants.
const SHARE_FLAGS = new Set(["--host", "--lan", "--network"]);
const share = argv.some((a) => SHARE_FLAGS.has(a));
const passthrough = argv.filter((a) => !SHARE_FLAGS.has(a));

// The port we intend to use. Next may still move off it; the share block below waits
// for Next to report the port it actually bound rather than trusting this.
const portFlag = passthrough.findIndex((a) => a === "-p" || a === "--port");
const port = portFlag >= 0 ? passthrough[portFlag + 1] : "3000";

/**
 * Interfaces that are real network cards almost never look like these. A VPN client or a
 * Hyper-V switch shows up next to your actual Wi-Fi, and handing someone that address
 * just fails silently — so they get separated out rather than listed as equals.
 */
const VIRTUAL =
  /virtual|vethernet|vmware|virtualbox|hyper-?v|docker|wsl|loopback|netextender|vpn|tailscale|zerotier|tunnel|tap-|openvpn/i;

/** Home and office networks are overwhelmingly 192.168.x.x, so rank that first. */
function rank(address) {
  if (address.startsWith("192.168.")) return 0;
  if (address.startsWith("10.")) return 1;
  return 2;
}

/** Every IPv4 address other machines could reach this one on, best guess first. */
function lanAddresses() {
  const out = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) {
        out.push({ name, address: addr.address, virtual: VIRTUAL.test(name) });
      }
    }
  }
  return out.sort(
    (a, b) =>
      Number(a.virtual) - Number(b.virtual) || rank(a.address) - rank(b.address)
  );
}

/** Read APP_PASSCODE without pulling in a dotenv dependency. */
function passcodeIsSet() {
  if (process.env.APP_PASSCODE?.trim()) return true;
  const envFile = path.join(process.cwd(), ".env.local");
  if (!existsSync(envFile)) return false;
  return readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .some((line) => /^\s*APP_PASSCODE\s*=\s*\S+/.test(line));
}

function printShareBlock(port) {
  const addresses = lanAddresses();
  const real = addresses.filter((a) => !a.virtual);
  const virtual = addresses.filter((a) => a.virtual);

  const out = ["", "  Sharing on your network", ""];

  if (addresses.length === 0) {
    out.push("  No network address found — are you connected to Wi-Fi?", "");
  } else {
    if (real.length > 0) {
      const [best, ...rest] = real;
      out.push(
        `  \x1b[1m\x1b[36mShare this link:  http://${best.address}:${port}\x1b[0m`,
        `                    (${best.name})`,
        ""
      );
      for (const { name, address } of rest) {
        out.push(`    or  http://${address}:${port}   (${name})`);
      }
      if (rest.length) out.push("");
    }

    if (virtual.length > 0) {
      out.push("  Ignore these — VPN and virtual adapters, they will not work:");
      for (const { name, address } of virtual) {
        out.push(`    http://${address}:${port}   (${name})`);
      }
      out.push("");
    }

    out.push(
      "  They must be on the SAME network as you. If they are not, a LAN address",
      "  cannot reach them — you need a tunnel or a deployed copy instead.",
      ""
    );
  }

  if (!passcodeIsSet()) {
    out.push(
      "  \x1b[33m! The app has no passcode, so anyone who opens that link is straight in.\x1b[0m",
      "    They can read your practice history, and spend your OpenAI credit if a key",
      "    is set. To put a passcode on it, add this to .env.local and restart:",
      "",
      "        APP_PASSCODE=something-you-can-tell-them",
      ""
    );
  } else {
    out.push("  A passcode is set — they will be asked for it.", "");
  }

  out.push(
    "  Windows may pop up a firewall prompt the first time. Allow access on",
    "  private networks, or nothing outside this machine can connect.",
    ""
  );

  process.stdout.write(out.join("\n") + "\n");
}

/**
 * Next refuses a second dev server in the same folder, but only after it has already
 * printed "Ready" on a fallback port — so you get told it started and then told it
 * didn't, which reads like a bug. Check first and say the one useful thing instead.
 */
async function alreadyServing(p) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    // Ask for one of OUR routes, not just "/". Something else on this port should not
    // stop the app starting — and /api/status answers 200 open, or 401 behind the
    // passcode. Either way it is this app.
    const res = await fetch(`http://localhost:${p}/api/status`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.status === 200 || res.status === 401;
  } catch {
    return false;
  }
}

if (await alreadyServing(port)) {
  console.log(
    `\n  The app is already running.\n\n` +
      `      http://localhost:${port}\n\n` +
      `  Open that — nothing else to do.\n\n` +
      `  To restart it instead, stop the other one first: close its window, or\n` +
      `  press Ctrl+C there. If you cannot find it, Next prints its PID when you\n` +
      `  try again, and "taskkill /PID <number> /F" stops it.\n`
  );
  process.exit(0);
}

const args = ["next", "dev", ...passthrough];
if (share) args.push("-H", "0.0.0.0");

// stdout is piped only when we need to watch for the port; otherwise inherit, so
// nothing about normal `npm run dev` changes.
const child = spawn("npx", args, {
  stdio: share ? ["inherit", "pipe", "inherit"] : "inherit",
  shell: true,
});

if (share && child.stdout) {
  let printed = false;
  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    if (printed) return;
    // Next prints "- Local:  http://localhost:3001" once it has really bound.
    const match = String(chunk).match(/localhost:(\d{2,5})/);
    if (match) {
      printed = true;
      printShareBlock(match[1]);
    }
  });
}

child.on("exit", (code) => process.exit(code ?? 0));
