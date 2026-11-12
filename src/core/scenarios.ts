export type Difficulty = "gentle" | "normal" | "tough";

export interface Scenario {
  id: string;
  label: string;
  blurb: string;
  /** Who the AI plays. */
  persona: string;
  /** What this scenario is training. Shown in the UI and fed to the coach. */
  focus: string;
  /** The AI speaks first with this, so you are never staring at a blank box. */
  opener: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: "standup",
    label: "Daily standup",
    blurb: "Give a 60-second status update",
    persona:
      "Priya, a team lead running a fast daily standup. You keep things moving and will politely cut rambling short.",
    focus:
      "Concise structured updates. Saying what is done, what is next, and what is blocked, without rambling.",
    opener:
      "Morning! Let's keep this quick. Can you give us your update — what you finished yesterday, what you're on today, and anything blocking you?",
  },
  {
    id: "disagree",
    label: "Disagreeing with a senior",
    blurb: "Push back politely on a bad idea",
    persona:
      "Mark, a confident senior director. You have just proposed a tight deadline you believe is achievable. You respect pushback but expect it to be backed with reasons.",
    focus:
      "Hedging and diplomatic disagreement. Softening language, offering alternatives, holding your position under pressure.",
    opener:
      "So I've told the client we can ship the whole migration by the end of this month. I know it's tight, but I think the team can do it. Thoughts?",
  },
  {
    id: "clarify",
    label: "Asking for clarification",
    blurb: "Handle something you didn't catch",
    persona:
      "Dan, an engineer who talks fast and uses heavy jargon and acronyms without explaining them.",
    focus:
      "Asking people to repeat or explain without sounding lost. Buying thinking time. Rephrasing to confirm understanding.",
    opener:
      "Right, so the issue is the CDC pipeline is backfilling into the ODS before the DQ checks run, which is why the downstream marts are stale. We'll need to re-key the SCD2 dims. You following?",
  },
  {
    id: "bad-news",
    label: "Delivering bad news",
    blurb: "Tell a client the project slipped",
    persona:
      "Sofia, an important external client. You are polite but clearly unhappy about delays and will ask direct questions about impact and recovery.",
    focus:
      "Diplomatic framing of problems. Taking ownership without over-apologising. Presenting a recovery plan.",
    opener:
      "Thanks for making time. Before we start — I heard from my team that the delivery date might be moving. Is that right?",
  },
  {
    id: "on-the-spot",
    label: "Put on the spot",
    blurb: "\"Any thoughts on this?\"",
    persona:
      "Elena, a VP in a large meeting. You ask broad, open questions with no warning and wait in silence for an answer.",
    focus:
      "Thinking out loud without freezing. Structuring an answer in real time. Filling pauses with signposting instead of fillers.",
    opener:
      "We've been going back and forth on whether to build this in-house or buy it. You've been quiet — what's your read on it?",
  },
  {
    id: "small-talk",
    label: "Pre-meeting small talk",
    blurb: "The five minutes before it starts",
    persona:
      "Tom, a friendly colleague from another team, chatting while waiting for others to join the call.",
    focus:
      "Natural rapport-building English. Following up on what people say instead of one-word answers.",
    opener:
      "Hey! We're a couple of minutes early, looks like we're waiting on the others. How's your week going so far?",
  },
  {
    id: "deadline",
    label: "Negotiating a deadline",
    blurb: "Ask for more time, keep credibility",
    persona:
      "Rachel, a project manager under pressure from above. You need dates and will push for commitments.",
    focus:
      "Assertive but collaborative negotiation. Making trade-offs explicit. Committing clearly.",
    opener:
      "I need to lock the plan today. Can you commit to having your part done by Thursday?",
  },
];

export const DIFFICULTY_NOTE: Record<Difficulty, string> = {
  gentle:
    "Be patient and warm. Speak in short, clear sentences. Give the learner plenty of room and never interrupt.",
  normal:
    "Behave like a normal professional colleague. Realistic pace, occasional follow-up questions.",
  tough:
    "Apply real pressure. Be brisk, interrupt if they ramble past three sentences, push back on vague answers, and demand specifics.",
};

export function getScenario(id: string): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}

/**
 * A distinct TTS voice per persona, so the scenarios feel like different people.
 * These are the long-standing OpenAI speech voices, available on every tier.
 */
const VOICES: Record<string, string> = {
  standup: "nova",
  disagree: "onyx",
  clarify: "echo",
  "bad-news": "shimmer",
  "on-the-spot": "alloy",
  "small-talk": "fable",
  deadline: "nova",
};

export function voiceFor(scenarioId: string): string {
  return VOICES[scenarioId] ?? "alloy";
}

/**
 * Ready-made answers to try, shown when a scenario starts.
 *
 * Each scenario gets a rough one and a clean one on purpose. The rough one is full of
 * the mistakes this app exists to catch, so you can see the coaching actually work; the
 * clean one shows what a good answer scores. Without these, a new scenario is a blank
 * box and you have to invent your own test material.
 */
export interface ScenarioExample {
  label: string;
  text: string;
}

const EXAMPLES: Record<string, ScenarioExample[]> = {
  standup: [
    {
      label: "Rough",
      text: "yesterday i have finish the api integration and today i will working on the bug fix. i am blocked since two day because staging server is down",
    },
    {
      label: "Cleaner",
      text: "I finished the API integration yesterday. Today I am on the bug fix. One blocker: the staging server has been down for two days.",
    },
  ],
  disagree: [
    {
      label: "Rough",
      text: "i am not agree with this deadline, it is too much short and we will not able to finish the migration in one month",
    },
    {
      label: "Cleaner",
      text: "I see the pressure we are under, but a month for the full migration worries me. Could we ship the core first?",
    },
  ],
  clarify: [
    {
      label: "Rough",
      text: "sorry i didn't understood, can you explain me again what is this CDC pipeline and why the marts are stale",
    },
    {
      label: "Cleaner",
      text: "Can I check one thing before you go on? I want to be sure I follow the part about the backfill ordering.",
    },
  ],
  "bad-news": [
    {
      label: "Rough",
      text: "i am very sorry to inform you that the project will delay by two week because we have faced some issues in the migration",
    },
    {
      label: "Cleaner",
      text: "I want to flag something early. The migration has hit a problem, and I expect a two-week slip. Here is what we are doing about it.",
    },
  ],
  "on-the-spot": [
    {
      label: "Rough",
      text: "umm actually i think we should buy it only because building will take more time and we dont have enough resource right now",
    },
    {
      label: "Cleaner",
      text: "My initial read is buy. Building it would cost us a quarter we do not have, and this is not where we differentiate.",
    },
  ],
  "small-talk": [
    {
      label: "Rough",
      text: "my week is going good, i have lot of works but its fine. how about you, what you did in weekend",
    },
    {
      label: "Cleaner",
      text: "Busy, but good — mostly heads-down on the migration. How has your week been?",
    },
  ],
  deadline: [
    {
      label: "Rough",
      text: "i think thursday is not possible for me because i have other works also, can we do it on next monday maybe",
    },
    {
      label: "Cleaner",
      text: "Thursday is tight. I can commit to Monday with confidence, or Thursday if we drop the reporting piece.",
    },
  ],
};

export function examplesFor(scenarioId: string): ScenarioExample[] {
  return EXAMPLES[scenarioId] ?? EXAMPLES.standup;
}
