import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PHRASE_BANK = JSON.parse(
  readFileSync(path.join(__dirname, "data", "leadIntentPhraseBank.json"), "utf8")
);

const WEIGHT_VALUES = { low: 1, medium: 2, high: 3 };

const INTENT_GROUPS = ["buyer_intent", "seller_intent_soft", "seller_intent_urgent", "investor_intent"];
const SELLER_GROUPS = new Set(["seller_intent_soft", "seller_intent_urgent"]);
// Routing priority when a message matches more than one intent group.
const CATEGORY_PRIORITY = ["seller_intent_urgent", "seller_intent_soft", "investor_intent", "buyer_intent"];

function normalize(text) {
  return (text || "").toLowerCase();
}

function findMatches(haystackLower, phrases) {
  return phrases.filter((phrase) => haystackLower.includes(phrase.toLowerCase()));
}

/**
 * Scores one piece of inbound lead text (an email/text/note body) against the
 * lead-intent phrase bank. A disqualify-phrase match overrides everything else,
 * per the phrase bank's own scoring_notes.
 */
export function scoreText(text, { replySpeedHours } = {}) {
  const haystack = normalize(text);

  const disqualifyMatches = findMatches(haystack, PHRASE_BANK.disqualify_immediately.phrases);
  if (disqualifyMatches.length > 0) {
    return {
      hotScore: 0,
      category: "disqualified",
      urgency: null,
      suppressed: true,
      matchedPhrases: disqualifyMatches.map((phrase) => ({
        phrase,
        group: "disqualify_immediately",
        category: "disqualified",
      })),
      situationalMatches: [],
      replySpeedFactor: null,
    };
  }

  const matchedPhrases = [];
  for (const groupKey of INTENT_GROUPS) {
    const group = PHRASE_BANK[groupKey];
    for (const phrase of findMatches(haystack, group.phrases)) {
      matchedPhrases.push({
        phrase,
        group: groupKey,
        category: group.category,
        weight: group.weight,
        urgency: group.urgency ?? null,
      });
    }
  }

  const situationalMatches = [];
  for (const [contextKey, phrases] of Object.entries(PHRASE_BANK.situational_context)) {
    if (contextKey === "_notes") continue;
    for (const phrase of findMatches(haystack, phrases)) {
      situationalMatches.push({ phrase, context: contextKey });
    }
  }

  // Sum the weight of each distinct group matched (not per-phrase), so a message
  // repeating one phrase-bank category doesn't inflate the score on its own.
  const matchedGroups = [...new Set(matchedPhrases.map((m) => m.group))];
  let hotScore = matchedGroups.reduce((sum, g) => sum + WEIGHT_VALUES[PHRASE_BANK[g].weight], 0);

  const hasSellerMatch = matchedGroups.some((g) => SELLER_GROUPS.has(g));
  if (hasSellerMatch && situationalMatches.length > 0) {
    hotScore += 2; // situational context stacks with seller intent, per scoring_notes
  }

  let replySpeedFactor = null;
  if (typeof replySpeedHours === "number") {
    replySpeedFactor = replySpeedHours < 1 ? "high" : replySpeedHours <= 24 ? "medium" : "low";
    hotScore += WEIGHT_VALUES[replySpeedFactor];
  }

  const topGroup = CATEGORY_PRIORITY.find((g) => matchedGroups.includes(g));
  const category = topGroup ? PHRASE_BANK[topGroup].category : "none";
  const urgency = topGroup ? PHRASE_BANK[topGroup].urgency ?? null : null;

  return {
    hotScore,
    category,
    urgency,
    suppressed: false,
    matchedPhrases,
    situationalMatches,
    replySpeedFactor,
  };
}

/**
 * Scores a batch of inbound communications (e.g. a lead's recent notes/texts/emails)
 * and rolls them up into one aggregate. Any suppressed item forces the whole
 * aggregate to suppressed/0, matching the phrase bank's "overrides all scoring" rule.
 */
export function scoreCommunications(items) {
  const scored = items.map((item) => ({
    ...item,
    scoring: scoreText(item.body, { replySpeedHours: item.replySpeedHours }),
  }));

  const suppressed = scored.some((s) => s.scoring.suppressed);
  const best = scored.reduce(
    (top, s) => (!top || s.scoring.hotScore > top.scoring.hotScore ? s : top),
    null
  );

  return {
    hotScore: suppressed ? 0 : scored.reduce((sum, s) => sum + s.scoring.hotScore, 0),
    suppressed,
    category: suppressed ? "disqualified" : best?.scoring.category ?? "none",
    urgency: suppressed ? null : best?.scoring.urgency ?? null,
    items: scored,
  };
}
