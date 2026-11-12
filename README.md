# Meeting English Coach

A personal English coach for workplace meetings. You role-play a realistic meeting
scenario — **speaking out loud or typing** — and every answer comes back with specific
corrections, stronger phrasings, speech metrics, and a score. The app remembers your
recurring mistakes across sessions.

## Running it

```
npm run dev
```

Open http://localhost:3000. **It works immediately, with no API key** — see Offline mode
below.

For real coaching, add your OpenAI key:

```
cp .env.local.example .env.local
```

Then paste your key after `OPENAI_API_KEY=` and restart. `.env.local` is gitignored —
never commit a real key, and set a spend limit in your OpenAI dashboard before you start.

## Running it free (Groq)

The app talks the OpenAI wire format, so it runs on any OpenAI-compatible provider —
only a URL changes, no code. **Groq's free tier covers both coaching and speech-to-text**,
and is what this setup was tested against:

```
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_API_KEY=<key from console.groq.com/keys>
OPENAI_MODEL=openai/gpt-oss-120b
OPENAI_STT_MODEL=whisper-large-v3
```

Text and speech are separate clients, so you can also split them across two providers:

```
OPENAI_SPEECH_BASE_URL=https://api.groq.com/openai/v1
OPENAI_SPEECH_API_KEY=<a different provider's key>
```

### Gemini

Its OpenAI-compatible endpoint works the same way
(`https://generativelanguage.googleapis.com/v1beta/openai/`, model `gemini-flash-latest`),
but **its free tier is not available for every project or region.** A project that does not
qualify answers `403 — free tier is not available for this project, please set up billing`,
even though the key itself is valid and `/models` lists 60+ models. Worth trying; Groq is
the dependable fallback.

### How it survives a provider that can't do structured outputs

OpenAI guarantees a response matching a JSON Schema. Most compatible providers implement
some of that and reject the rest, each in their own way. `src/core/structured.ts` walks
down three rungs rather than betting on one:

1. **strict `json_schema`** — a guaranteed shape
2. **`json_object`** — guaranteed JSON, shape asked for in the prompt
3. **plain text** — the JSON dug out of whatever came back, markdown fence and all

Every rung ends at the same zod validator, so a wrong shape still fails loudly. The
fallbacks lose the guarantee, not the checking. All three are tested against a stand-in
provider that rejects each mode in turn.

### Speaking speed

A **Slow / Easy / Normal** control sits beside the language switch. It was hardcoded at
1.05x — faster than normal speech, which is the wrong default for someone still catching
the words. Default is now 0.85x, remembered per device, and it drives the browser voice
and a real text-to-speech provider alike, so the setting means one thing whichever engine
is speaking.

### What you give up

- **Text-to-speech.** Groq's Orpheus voice needs its terms accepted in the console first,
  and most compatible providers have no speech endpoint at all, so replies use the
  browser's own voice. The route sniffs the response and falls back automatically —
  including when a provider answers `200` with JSON instead of audio, which otherwise
  means a silent reply and no clue why.
- **Live calls.** `/live` is a real speech-to-speech WebRTC connection to OpenAI. Nothing
  free substitutes for it, so that page needs an OpenAI key or it stays unavailable.

Everything else works: typed coaching, spoken answers with words-per-minute, the learner
profile, the dashboard and the review deck.

Free tiers change often — check each provider's own page before relying on a limit.

## Offline mode

With no `OPENAI_API_KEY` set in development, the app falls back to a built-in rule engine
(`src/core/mock.ts`) instead of failing. Every screen works, nothing is billed, and the UI
shows an amber banner saying so.

What it does and does not do:

| | Offline | With a key |
|---|---|---|
| Typed coaching | Rule-based, ~11 common mistakes | Real |
| Speech-to-text | Canned learner sentences | Real |
| Spoken replies | Browser `speechSynthesis` | OpenAI voices |
| Progress, deck, profile | Fully working | Fully working |
| Live call | **Not possible** | Real |

It is a rule table and some arithmetic, not a language model: it catches a fixed list of
patterns (`have finish`, `will working`, `since two day`, `informations`, `discuss about`,
`i am agree`, `more better`, `didn't went`, lowercase `i`, and a few more) and scores by
heuristic from error rate, filler rate and sentence length.

That is enough to click through every screen and watch a real mistake flow all the way into
the dashboard and the review deck. It is **not** real coaching, which is exactly why the
banner says so rather than letting it pass.

Live calls cannot be faked — they are a genuine speech-to-speech WebRTC connection — so
that one page says so plainly instead of pretending.

Force it either way with `MOCK_AI=1` or `MOCK_AI=0`.

Pick a scenario, set the pressure level, then **press the mic and answer out loud** the way
you would actually speak in the meeting — mistakes included. That's what gets corrected.

## Hinglish mode

Above the input there is an **English / Hinglish** switch. On English nothing changes —
the app coaches your English exactly as before. On Hinglish you write what you mean the
way you actually speak and get the English back.

**Roman letters, not Devanagari.** You type on an English keyboard, so
`maine kal kaam khatam kar diya` is the expected input, and Hindi grammar with English
words mixed in (`mujhe testing karna hai aaj`) is normal. Devanagari works too, and the
remembered phrases come back in whichever script you used rather than being converted.

It is deliberately **not** coaching. There is nothing to correct in a Hindi sentence, so
instead you get:

- the English a confident professional would actually say — meaning, not a word-for-word
  translation, which produces English nobody speaks
- two alternatives at different levels of directness, each clickable
- **Worth remembering** — the two to four fragments you will need again in other
  meetings, mapped Hindi → English with a note on when to use them

Then the part that matters: **Practice saying this** drops that English into the box and
flips you back to English mode, so you say it yourself and get coached on it. A
translation you read and move on from teaches nothing; the loop is
Hindi → English → say it → corrected.

**Translations are not recorded as practice.** Saying something in Hindi is not an attempt
at English, so scoring it would be meaningless and counting it would skew the error rate
and the progress charts. The translation lives in the conversation and its history;
nothing else.

Spoken Hindi works too — press the mic in Hinglish mode and the transcription runs with
`language: "hi"`. The verbatim-bias prompt is skipped there on purpose: it is an English
sample whose whole job is to stop Whisper tidying up a learner's English, and feeding it
to a Hindi transcription would only drag the output toward English.

## My library

Every stronger word the coach suggests, and every phrase from a Hinglish translation,
has an **Add** button beside it. Tap it and the word lands in `/library` with a plain
meaning and a sentence showing where to use it — both generated once, on the way in,
rather than on every correction you were never going to save.

Entries are grouped by day, so "what did I learn today" has a real answer. It is
deliberately opt-in: the review deck already collects every correction automatically, and
a library that filled itself the same way would just be a second copy of it.

## Weekly test

`/test` builds a short test from **your own last 6 days** — the mistakes you actually
made and the words you saved. Nothing generic, nothing from a textbook. Four question
types: fix the mistake, say it better, use the word, explain the word.

Answer by typing or by speaking. Everything is marked in one call at the end — cheaper
than marking per question, and it stops the app leaking question three's answer while you
are still on question two. You get a percentage, a band, per-question feedback with a
model answer, and one thing to work on next week. Past attempts are kept, so the scores
become a line rather than a one-off.

Demo turns are excluded from the material: testing someone on mistakes they never made is
pointless.

## Conversation history

**The chat you are in stays open until you press New.** Go to Review or Progress and
back, or refresh the page, and the same conversation reopens from the database. Only
**New** — or picking another scenario or pressure level — starts a fresh one. Which chat
is open is remembered per device; the chat itself is saved on the server.

Every chat is saved, English and Hinglish turns alike, from its first message. The
**History** button lists every past conversation: scenario, when, the first thing you
said, and how many messages it holds. Tap one to reopen it exactly as it was, coaching
and translation cards and all.

Each conversation can be deleted. **Deleting removes the turns it produced as well**, and
rebuilds your learner profile from what is left. The alternative — erasing the chat but
keeping its mistakes in your profile — would mean the coach carried on citing a session
you asked to erase. The confirmation says so before anything goes.

Two different things are stored, deliberately:

| MongoDB collection | File fallback | What it is | Used by |
|---|---|---|---|
| `conversations` | `conversations.json` | The readable thread | History, reopening |
| `turns` | `sessions.json` | One record per answer | Dashboard, review deck, profile |
| `profile` | `profile.json` | Your recurring patterns | Injected into every prompt |
| `cards` | `cards.json` | Review schedules | Review deck |
| `library` | `library.json` | Saved words | Library, weekly test |
| `tests` | `tests.json` | Weekly test results | Test history |

Where it lives depends on one setting — see **Database** below.

## Database

With `MONGODB_URI` set in `.env.local`, everything above lives in **MongoDB** (Atlas works
as is). Your history survives a deploy and every device that talks to the server sees the
same data:

```
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/
MONGODB_DB=english_coach
```

Leave `MONGODB_URI` blank and the app falls back to plain JSON files in `data/` on your own
machine (gitignored) — no setup at all, which is still the right choice for trying it out.

Two things to know:

- **Atlas → Network Access** must allow the machine the server runs on, or every request
  fails with a connection error that says so. For a host like Render, allow `0.0.0.0/0`;
  its outbound addresses change.
- **Already practised on files?** Copy them across once:

  ```
  npm run db:migrate
  ```

  It only reads `data/`, so the files stay as a backup. It is safe to run twice — records
  are written under fixed ids, so nothing is duplicated — but run it *before* practising
  on MongoDB, since a re-run puts the file's version of a conversation back over a newer
  one.

`scripts/seed-demo.mjs` writes to whichever store is live, with the same rules as before:
`--clear` removes only the invented turns.

All storage goes through `src/core/store.ts`; `store-mongo.ts` and `store-file.ts` are the
two backends behind it, and nothing else in the app touches either.

## Trying it out

Every scenario ships with two ready answers, shown under the conversation before your
first reply: one **Rough** (full of the mistakes this app exists to catch) and one
**Cleaner**. Tap either to drop it in the box, then Send. That is the fastest way to see
what the coaching actually does without inventing test material.

A five-minute tour:

1. **Daily standup → Rough** — watch it catch `have finish`, `will working`,
   `since two day`, and the missing `the`. Four mistakes, each with the rule in plain
   English.
2. **Same scenario → Cleaner** — the same situation said well. Compare the scores.
3. **Switch to Tough** and answer in your own words. The persona gets brisk and pushes
   back on vague answers.
4. **Press the mic** and say the rough example out loud. The transcript keeps your
   mistakes rather than tidying them, and you get words-per-minute and a filler count
   that typing cannot give you.
5. **Progress** — your error rate per 100 words, the four score trends, your pace against
   the 110–165 wpm meeting band, and the mistakes you keep repeating.
6. **Review** — flashcards built from the mistakes you just made, not a generic deck.

## Showing it to someone else

```
npm run dev -- --host
```

That binds to your network instead of just localhost and prints the link to send:

```
  Share this link:  http://192.168.1.35:3000
                    (Ethernet)
```

It picks out your real network card and separates off VPN and virtual adapters, which sit
in the list looking identical and silently fail if you send one. The port it prints is the
port Next actually bound — it waits for Next to say so, because Next quietly falls back to
3001 when 3000 is taken, and a confidently wrong link is worse than none.

Three things to know:

- **They must be on the same network as you.** A `192.168.x.x` address is not reachable
  from outside your Wi-Fi. If they are somewhere else, you need a tunnel (ngrok,
  cloudflared) or a deployed copy.
- **Set a passcode first.** Without `APP_PASSCODE`, anyone who opens that link is straight
  in — they can read your practice history and spend your OpenAI credit. The command warns
  you when it is unset.

  ```
  npm run passcode              generate one into .env.local
  npm run passcode -- --show    print it so you can tell them
  npm run passcode -- --force   replace it (signs out every device)
  ```

  It generates word-based codes like `amber-ladder-quartz-river-42`, because this is a
  passcode you have to say out loud to another person. Restart the server after setting it.
- **Windows will ask about the firewall** the first time. Allow it on private networks, or
  nothing outside your machine can connect.

Plain `npm run dev` is unchanged and stays on localhost only.

## Voice

Press the mic, speak, press stop. The recording is transcribed, coached, and the persona
replies in its own voice (each scenario has a distinct one). Press the speaker icon on any
reply to hear it again.

Speaking unlocks metrics typing cannot give you:

- **Words per minute**, with a verdict — under 110 reads as unsure, over 165 as nervous
- **Filler count** — "um", "basically", "you know", and friends
- **Longest sentence**, flagged past 25 words, because that's where listeners lose you

Recording auto-stops at 3 minutes so a forgotten open mic can't run up a bill.

### A real caveat about transcription

Whisper is trained to produce *fluent* text, so by default it quietly repairs a learner's
grammar and drops fillers. That would hand the coach a clean sentence and make it report no
errors — defeating the whole app. `src/core/speech.ts` counters this with a deliberately
disfluent `VERBATIM_BIAS` prompt, which biases Whisper toward transcribing what you actually
said. **It is a bias, not a guarantee.** If you notice your spoken mistakes aren't being
caught but your typed ones are, that's why — edit that prompt first.

## Live calls

`/live` (the **Live** link in the header) is a real spoken conversation in real time —
speech to speech, no push-to-talk. They talk over you if you ramble.

The browser connects to OpenAI over **WebRTC directly**. The audio never passes through
this server, because that round trip is the difference between a conversation and a
walkie-talkie. The server's only job is to mint a short-lived ephemeral token, so
`OPENAI_API_KEY` never reaches the browser.

**Difficulty is real behaviour here, not prompt wording.** It sets how long the model waits
through your silence before it starts talking: 1200ms on gentle, 400ms on tough. On tough,
hesitation gets punished the way it does in an actual meeting.

**Nothing is corrected during the call.** Interrupting someone mid-sentence to fix an
article would destroy the thing being practised. When you hang up, the whole transcript is
marked in one model call that returns a session summary — what worked, the biggest problem,
and one concrete thing to fix next time — plus per-utterance coaching.

That per-utterance half deliberately reuses the same coaching contract as typed and spoken
turns, so a live call feeds your learner profile, your progress charts and your review deck
with no special handling.

### If a live call will not start

The Realtime API's endpoints and model names have moved more than once. All three are
overridable, and failures surface OpenAI's own error text rather than a generic message:

```
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview
OPENAI_REALTIME_SESSIONS_URL=https://api.openai.com/v1/realtime/sessions
OPENAI_REALTIME_URL=https://api.openai.com/v1/realtime
```

Check the current OpenAI docs and override whichever has moved. `useRealtime` also keeps a
list of unrecognised event types for the same reason — if transcripts stop appearing, the
event names changed and that list will show it.

**Cost:** Realtime audio is considerably more expensive per minute than the other modes.
Calls hard-stop at 10 minutes. Use push-to-talk for drilling and save live calls for real
pressure practice.

## On your phone

Android gets a native app via Capacitor; iPhone installs as a PWA (you are on Windows, so
iOS native would need a Mac). Full workflow, prerequisites and the HTTPS caveat for iOS
microphone access: **[MOBILE.md](MOBILE.md)**.

```
npm run dev:lan                                            # reachable from your phone
MOBILE_SERVER_URL=http://192.168.1.50:3000 npm run mobile:sync
npm run mobile:open                                        # opens Android Studio
```

## The progress dashboard

`/dashboard` (the **Progress** link in the header) is where the learner profile becomes
visible:

- **Errors per 100 words over time** — the headline "am I actually improving?" line,
  normalised for answer length so a long answer isn't punished
- **Four score trends** as small multiples: clarity, grammar, professionalism, conciseness,
  each with its average and the change since you started
- **Speaking pace** against the 110–165 wpm band where meeting speech lands
- **Mistakes you keep repeating**, each tagged *improving* / *persistent* / *getting worse*
  by comparing how often it appeared in the older half of the window against the newer half
  — as a rate, so an uneven split can't fake an improvement
- **Filler words** and **scenario coverage** — the scenarios you avoid are usually the ones
  worth practising

To look at it before you have real history:

```
node scripts/seed-demo.mjs
```

That adds 36 invented sessions showing a realistic improvement curve — useful when you want
to show the dashboard to someone before you have a month of real history.

Demo turns are tagged, and the script never touches turns you actually practised. It merges
rather than overwrites, and `--clear` removes only the invented ones:

```
node scripts/seed-demo.mjs --clear
```

**Run that before practising seriously.** While demo data is present, its invented error
patterns are folded into your learner profile and injected into your coaching prompts, so
the coach will nag you about mistakes you never made. Clearing rebuilds the profile from
your real turns alone.

### Chart conventions

Every chart plots a single series, so the categorical palette is one hue (`#2a78d6`),
validated against the white card surface it actually sits on. Status colours (green / amber
/ red on the pattern list) are a separate fixed palette, used only where the colour
genuinely means a state, and only ever on the **mark** — the status label itself wears a
text token, because the warning amber falls below 3:1 on a light surface. Every status mark
is paired with an icon and a word, so colour never carries meaning alone. Values are
directly labelled; hover tooltips enhance but never gate.

### Theming

Brand indigo `#4f46e5` is both the UI accent and the chart series colour — validated
against the white card surface the charts sit on, so the interface and the data are drawn
from one palette rather than two that nearly match. Reusable component classes (`.card`,
`.btn-primary`, `.pill`, `.bubble-user`, `.field`, `.glass`) live in `globals.css`, which
is why a restyle touches the tokens and those classes rather than every file.

No component names a raw colour. `src/app/globals.css` defines semantic tokens — `page`,
`surface`, `raised`, `line`, `line-strong`, `ink`, `ink-2`, `muted` — and everything is
written against those. That is what turned a full dark-to-light flip into a token change
rather than ~260 class edits, and it is what would make adding a dark mode back the same
again. The token values are the light column of the chart palette's chrome table, so the
UI chrome and the chart chrome are one set of colours rather than two that nearly match.

## The review deck

`/review` (the **Review** link in the header) is spaced repetition built entirely from your
own mistakes — nothing is authored, every card is derived from your practice history.

Three card types:

- **Fix the mistake** — the exact wrong fragment you produced, with the correction and why
- **Stronger word** — a vague word you used, with the professional alternative
- **Say it better** — a whole sentence of yours that had errors, against the phrasing a
  confident native professional would use

Cards are deduplicated by a hash of their content, so a mistake you made 35 times is **one
card you see often**, not 35 cards — and the badge tells you the count, which is the part
that makes you pay attention. Because ids are content hashes, regenerating the deck after
new practice keeps every existing card's review schedule intact.

Scheduling is plain **SM-2** in `src/core/srs.ts`: four buttons (Again / Hard / Good /
Easy), each showing when you would next see the card before you commit. Miss a card and it
comes back in the same session.

Press **Say it out loud** on any card to answer by speaking. It transcribes what you said
and scores it against the target. That number is a **rough recall check, not a
pronunciation score** — transcription tidies up some of what you actually say, and the UI
says so on every result. Treat a high score as "close enough", never as "pronounced
correctly".

## The passcode gate

There are no accounts — one shared passcode unlocks the app and issues a signed, stateless
token. Set it in `.env.local`:

```
APP_PASSCODE=something-long-and-not-guessable
```

**Leave it blank in local development and there is no gate** — nothing is in the way while
you work. **In production an unset passcode locks the app instead of opening it:** the API
returns 503 and pages redirect to an explanatory screen. That asymmetry is deliberate. An
accidental deploy should never quietly become an open API that spends your OpenAI credit
and hands out your practice history.

The session lasts 30 days and travels two ways, because the clients differ: the web app
and PWA use an HttpOnly cookie, while the bundled native app is a different origin and
sends a bearer token instead. `src/core/auth.ts` is written against Web Crypto rather than
`node:crypto` because it runs inside `src/proxy.ts` on the Edge runtime, where
`node:crypto` does not exist.

Passcode comparison is constant-time, and `/api/auth` is rate-limited to 10 attempts per
15 minutes per IP — a single secret with no lockout behind it is otherwise guessable at
network speed. The limiter counts successes too, so it cannot be used as an oracle.

**Lock** on the progress page signs out: it clears the cookie server-side and the stored
token locally.

## Why this beats a plain chatbot

A general assistant forgets you every session. This app accumulates a **learner profile**
(`data/profile.json`) of your recurring error patterns and filler habits, and injects it into
every system prompt — so the coach says *"you dropped the article again, that's your number
one pattern"* instead of generic praise.

## Layout

```
src/core/          Pure logic. Imports nothing from Next.
  schemas.ts       The coaching contract: strict JSON Schema + zod validator
  prompts.ts       System prompt builder, injects the learner profile
  scenarios.ts     Scenario library (persona, focus, opener, voice, try-these examples)
  profile.ts       Learner profile reducer (pure, testable)
  metrics.ts       Words, sentence length, fillers, words-per-minute
  coach.ts         One model call returns reply + coaching together
  realtime.ts      Ephemeral tokens for the live WebRTC call
  debrief.ts       Marks a whole live call in one request
  translate.ts     Hinglish in, English out (help, not a scored answer)
  library.ts       Saved words: meaning plus a usage example
  test.ts          Weekly test: builds it from your week, marks it
  mock.ts          Offline rule engine used when there is no API key
  openai-client.ts Text and speech clients; any OpenAI-compatible provider
  structured.ts    Structured output with fallbacks for weaker providers
  analytics.ts     Turn history -> chart-ready view model (pure)
  srs.ts           SM-2 spaced repetition (pure)
  cards.ts         Derives the deck from your mistakes, deduplicated
  text.ts          Normalising, word-level similarity, stable ids
  speech.ts        Transcription and speech synthesis
  session.ts       The shared turn pipeline: coach, measure, persist
  conversations.ts Saved chat threads (types, summaries)
  store.ts         Persistence, behind a handful of functions
  store-mongo.ts   MongoDB backend, used when MONGODB_URI is set
  store-file.ts    JSON-file backend in data/, the fallback
src/hooks/
  useRecorder.ts   MediaRecorder wrapper: codec picking, timer, permissions
  useRealtime.ts   The live WebRTC call and its event stream
src/app/api/
  coach/           Typed turn
  speak/           Spoken turn (audio in, transcript + coaching out)
  tts/             Speaks a line in the persona's voice
  profile/         Profile + recent history, read by the dashboard
  cards/           The review deck; POST grades a card
  cards/check/     Scores a spoken attempt at a card
  auth/            Passcode in, session out
  conversations/   History list; load or delete one
  translate/       Hinglish to English (typed or spoken)
  realtime/        Live session tokens, and the post-call debrief
  status/          Whether the app is running offline
src/components/
  CoachCard.tsx    The feedback panel
  ChatHistory.tsx  Past conversations: open, rename, pin, copy, delete
  AddToLibrary.tsx One-tap save for a word
  TranslationCard.tsx  The English, alternatives, and phrases to keep
  DemoBanner.tsx   Says when answers are coming from the rule engine
  charts/          Sparkline, BarList, StatTile, palette tokens
src/core/auth.ts   Passcode check and signed tokens (Web Crypto, Edge-safe)
src/lib/
  api.ts           Where the API lives, and apiFetch which carries the session
src/proxy.ts       CORS allowlist for the native shell
android/           Capacitor Android project
scripts/
  seed-demo.mjs    Demo history for previewing the dashboard
  migrate-to-mongo.mjs  Copies data/*.json into MongoDB (npm run db:migrate)
  make-icons.mjs   Generates the PNG app icons
  mobile-sync.mjs  Syncs the native shell in server mode
  build-mobile.mjs Static bundle for the native shell
data/              Your profile and session history (gitignored)
```

`src/core` deliberately has no Next.js imports. When the mobile app arrives, that folder
moves to `packages/core` and the routes become a standalone API — the engine doesn't change.

Codec selection in `useRecorder.ts` prefers webm/opus (Chrome, Firefox) and falls back to
mp4 (Safari). Both are formats the transcription endpoint accepts.

## Scenarios

Daily standup · Disagreeing with a senior · Asking for clarification · Delivering bad news ·
Put on the spot · Pre-meeting small talk · Negotiating a deadline

Each has three pressure levels. **Tough** interrupts you if you ramble and pushes back on
vague answers.

## Tuning it

The quality of this app *is* the quality of the prompt in `src/core/prompts.ts`. If feedback
feels generic or too soft, edit the coaching rules there first — it's the highest-leverage
file in the project.

Models are all env-configurable (`OPENAI_MODEL`, `OPENAI_STT_MODEL`, `OPENAI_TTS_MODEL`).
Note that `verbose_json` — which gives true audio duration for words-per-minute — is only
supported by `whisper-1`; `speech.ts` falls back to the client's stopwatch for other models.

## Not built yet

Phase 7: meeting prep from a pasted agenda, and a post-meeting debrief for real meetings
rather than practice ones.

The app is not deployed anywhere, so the mobile builds currently point at your own
machine. Deploying it is what unlocks iOS microphone access (HTTPS) and a bundled Android
build that works away from your network.
