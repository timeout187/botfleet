export interface CrashAnalysis {
  summary: string;
  suggestedAction: string;
  confidence: "low" | "medium" | "high";
}

interface Rule {
  pattern: RegExp;
  summary: string;
  suggestedAction: string;
  confidence: CrashAnalysis["confidence"];
}

/**
 * This is NOT a call to an LLM - it's a small, honest, deterministic rule
 * set over Discord gateway/HTTP error signatures. It exists so the AI
 * worker queue's plumbing (enqueue -> separate worker process -> cached
 * result) is real and exercised end-to-end today, without requiring an
 * external AI provider API key this project doesn't have. Swapping this
 * function's body for a real LLM call later doesn't require touching the
 * queue, the worker, or the API routes - see docs/roadmap.md.
 */
const RULES: Rule[] = [
  {
    pattern: /4004|invalid token|401/i,
    summary: "The bot's token appears to be invalid or was revoked.",
    suggestedAction: "Rotate the bot's token from its detail page.",
    confidence: "high",
  },
  {
    pattern: /4014|disallowed intent/i,
    summary: "Discord rejected a privileged intent the bot requested.",
    suggestedAction:
      "Enable the required privileged intents (Presence/Server Members/Message Content) for this bot in the Discord Developer Portal.",
    confidence: "high",
  },
  {
    pattern: /429|rate limit/i,
    summary: "The bot is being rate-limited by Discord.",
    suggestedAction:
      "Check for a restart loop or excessive API calls; consider spacing out reconnect attempts.",
    confidence: "medium",
  },
  {
    pattern: /ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i,
    summary: "The bot's process couldn't reach Discord's network.",
    suggestedAction: "Check the worker host's network/DNS connectivity.",
    confidence: "medium",
  },
];

export function analyzeCrash(errorMessage: string): CrashAnalysis {
  const rule = RULES.find((r) => r.pattern.test(errorMessage));
  if (rule) {
    return {
      summary: rule.summary,
      suggestedAction: rule.suggestedAction,
      confidence: rule.confidence,
    };
  }
  return {
    summary: "No known pattern matched this error.",
    suggestedAction: "Review the full logs manually for this bot.",
    confidence: "low",
  };
}
