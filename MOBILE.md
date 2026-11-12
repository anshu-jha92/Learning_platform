# Running this on your phone

There are two routes onto a phone, and on Windows they split by platform:

| | Android | iPhone |
|---|---|---|
| Native app (Capacitor) | **Yes** — works on Windows | Needs a Mac + Xcode |
| Installable PWA | Yes | **Yes** |

You are on Windows, so: **Capacitor for Android, PWA for iPhone.** Nothing here needs a
Mac, an Apple Developer account, or an app store.

---

## iPhone — install as a PWA (2 minutes)

1. Make the app reachable from your phone. On your PC:

   ```
   npm run dev:lan
   ```

   That binds to `0.0.0.0` instead of localhost, so other devices on your network can
   reach it. Find your PC's LAN address with `ipconfig` (something like `192.168.1.50`).

2. On the iPhone, open Safari and go to `http://192.168.1.50:3000`.
3. Share → **Add to Home Screen**.

It launches full-screen with its own icon, no browser chrome. The manifest, icons, and
`apple-touch-icon` are already in `public/`.

**One caveat that matters:** iOS only allows microphone access on `https://` or
`localhost`. Over plain `http://` on your LAN, **recording will not work on iPhone** —
typing still will. To get voice on iOS you need the app served over HTTPS, which in
practice means deploying it (Vercel gives you HTTPS for free) and installing the PWA from
that URL instead.

Android Chrome is more permissive here, but the same fix applies if you hit it.

---

## Android — the native app

### What you need first

- **Android Studio** (brings the Android SDK and an emulator)
- **JDK 21** — Android Studio bundles one

You do not need a Google Play account. You are installing onto your own phone.

### Option 1 — server mode (start here)

The shell loads the live app over the network. Nothing to rebuild as you work, and the
whole app including its API routes just works.

This is the fastest way to answer the one question that actually matters:
**does the microphone work inside a real WebView on a real phone?** Find that out now,
not after you have built a bundling pipeline.

```
npm run dev:lan
```

Then, in another terminal (use your PC's LAN address — `localhost` on the phone means the
phone itself):

```
MOBILE_SERVER_URL=http://192.168.1.50:3000 npm run mobile:sync
```

```
npm run mobile:open
```

Android Studio opens. Press Run with your phone connected over USB (with USB debugging on)
or an emulator selected.

Cleartext HTTP is enabled automatically when `MOBILE_SERVER_URL` starts with `http://` —
Android blocks it by default, and without that flag the app silently shows a blank screen.

### Option 2 — bundle mode (a real standalone app)

The web UI ships inside the APK and calls a hosted API. This is what you want once the app
is deployed somewhere.

```
NEXT_PUBLIC_API_BASE_URL=https://your-api.example.com npm run mobile:bundle
npm run mobile:open
```

Next cannot static-export an app that has POST route handlers, so `scripts/build-mobile.mjs`
temporarily renames the `route.ts` files out of the way, exports, then restores them. It
renames the individual files rather than the `api/` folder on purpose: on Windows a running
dev server holds a watch handle on the directory and renaming it fails with `EPERM`.
Restoration happens in a `finally`, and the script repairs itself on startup if it was ever
killed mid-run.

**The bundled app needs a reachable API.** `NEXT_PUBLIC_API_BASE_URL` is baked in at build
time — change it and you must rebuild.

---

## Microphone permissions

`android/app/src/main/AndroidManifest.xml` already declares `RECORD_AUDIO` and
`MODIFY_AUDIO_SETTINGS`. Capacitor's WebView bridges the browser's `getUserMedia` request
to the Android runtime permission prompt, so the first time you press the mic the system
asks, and the recorder's own error messages cover refusal.

If you ever see "Microphone access was blocked" with no system prompt appearing, the
manifest permission is missing — that is the symptom.

---

## Signing in on the phone

The app is passcode-gated (see the README). On the phone it works the same way: you get
the passcode screen on first launch, and the session lasts 30 days.

The mechanism differs by mode, and it matters if you are debugging:

- **Server mode** — the shell loads pages from your server, so it is same-origin and the
  HttpOnly cookie does the work, exactly like a browser.
- **Bundle mode** — the page is served from the device and the API is elsewhere, so the
  cookie will not be sent. Sign-in stores a bearer token instead, which `apiFetch` attaches
  to every request. This is why `/api/auth` returns the token in the body as well as
  setting a cookie.

If the phone can reach the API but every call comes back 401, you are almost certainly in
bundle mode with a cookie that cannot travel. Check that the token was stored.

## Letting the phone talk to your API

When the app runs in the native shell it is served from the device, so every API call is
cross-origin. `src/proxy.ts` handles CORS for the Capacitor origins
(`http://localhost`, `capacitor://localhost`).

If you deploy the API and call it from somewhere else, add that origin:

```
ALLOWED_ORIGINS=https://coach.example.com
```

**This is an allowlist, not a wildcard, deliberately.** Even behind the passcode, a
wildcard would let any page you had open make authenticated requests from your browser.
Do not widen it to `*`.

Note that `credentials: "include"` is on, which is what lets the cookie travel to an
allowed cross-origin API — and is exactly why the origin list has to stay tight.

### Before you deploy

- Set `APP_PASSCODE` to something long. It is the only thing between the internet and
  your OpenAI bill.
- Set `ALLOWED_ORIGINS` to your deployed front-end origin, nothing wider.
- Serve over HTTPS. The session cookie is marked `Secure` in production, so it will not
  be set over plain HTTP — and iOS needs HTTPS for microphone access anyway.

`npm run dev:lan` has no such protection unless you also set `APP_PASSCODE` locally.
Without it, anyone on your network can reach your coach and your history while it runs.
