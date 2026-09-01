---
name: hot-lead-detection
description: Score a lead's inbound messages against the Believe The Process phrase bank to catch buyer/seller/investor intent, distressed-seller situational context, and disqualify signals by exact wording - not reading comprehension. Use when a specific message or lead needs a fast, explainable hot/warm/disqualify call, or to double-check skills/fub-lead-scoring's judgment against the phrase bank.
---

# Hot Lead Detection (phrase-bank scoring)

`score_lead_intent` runs deterministic phrase matching from `src/data/leadIntentPhraseBank.json` - it looks for exact wording, not intent it has to infer. This is a different, complementary signal to `skills/fub-lead-scoring`'s motivation/timeframe/financing/engagement judgment call: that skill reads between the lines across a lead's whole history, this one flags specific phrases the moment they appear. Use both - this one is fast and explainable ("hot because they said X"), that one catches intent that's implied rather than stated.

## When to use it

- A single new message just came in and you want an immediate read before doing a full history review.
- You want to double-check or justify a Hot/Warm call from `skills/fub-lead-scoring` against the actual wording that triggered it.
- The user asks "did this lead say anything that should suppress them" (opt-outs, "not interested", wrong number, etc.) - `score_lead_intent` catches this deterministically where a reading-comprehension pass might miss a throwaway line.

## How to call it

- One message you already have the text for: pass `text` directly.
- A lead in Follow Up Boss: pass `personId` - it pulls their recent notes, inbound texts, and inbound emails and scores each one plus a rolled-up aggregate. Notes come back with `direction: "unknown"` since FUB doesn't tag note authorship - use judgment on whether a note is quoting the lead's own words or an agent's paraphrase.
- If you know how long it took the lead to reply to the last outbound touch, pass `replySpeedHours` (only used with `text`) - under 1hr, 1-24hr, and over-24hr each add a small score bump, per the phrase bank's own scoring notes.

## Reading the result

- `hotScore` - numeric, phrase-bank weight sum for the matched categories (not per-phrase, so repeating one phrase doesn't inflate it). This is a per-call score, not FUB's persisted `Priority:` tag - use `tag_lead_priority` separately if you want to write a tier back.
- `category` - `buyer`, `seller`, `investor`, `disqualified`, or `none`. When multiple categories match, urgent-seller outranks soft-seller outranks investor/buyer.
- `urgency` - `high`/`soft` for seller matches, otherwise `null`.
- `suppressed` - `true` means a disqualify phrase matched ("not interested", "stop texting me", "remove me", "wrong number", etc.). This **overrides every other match** - `hotScore` is forced to 0 and `category` to `disqualified`, even if the same message also had buyer/seller language in it. Treat `suppressed: true` as the whole call, not one input among several.
- `matchedPhrases` - exactly which phrase(s) fired, for transparency (cite these when explaining a hot/disqualify call instead of just asserting the score).
- `situationalMatches` - pre-foreclosure/probate/divorce/inherited/affidavit-of-death/distressed-general context. These alone contribute nothing to `hotScore` - they only add +2 when they show up alongside a seller-intent match, per the phrase bank's design (a probate mention with no seller language isn't a lead signal by itself).

## Acting on a `suppressed` result

This tool only scores - it doesn't tag or suppress anything in FUB automatically. When you get `suppressed: true`:
- Recommend (or, if asked, apply) `update_lead` with a tag like `Do Not Contact`, and/or `tag_lead_priority` with `tier: "None"` to clear any existing priority tag.
- Don't recommend further outreach in the same turn - surface the exact disqualify phrase that matched so the human sees why.

## Output format

Keep it short and cite the evidence:

```
Hot - seller, urgent (score 7)
"need to sell fast" + "cash offer" matched, plus probate context ("my parent passed").
Recommend: call now, mention cash/as-is options.
```

```
Suppressed - disqualified
"stop texting me" matched. Recommend tagging Do Not Contact and clearing priority tag.
```
