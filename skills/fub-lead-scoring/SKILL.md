---
name: fub-lead-scoring
description: Score every lead in Follow Up Boss as Hot, Warm, or Cool using a motivation/timeframe/financing/engagement lead matrix, then produce a daily follow-up list. Use whenever the user asks who to follow up with today, for a daily/morning lead review, or to prioritize their FUB pipeline.
---

# Follow Up Boss Lead Scoring

Turn raw Follow Up Boss activity into a short, prioritized "who do I contact today" list, by scoring each lead on **motivation**, **timeframe**, **financing/ability**, and **recent engagement** - not just by how old the lead is.

## Data to pull

Call `get_priority_leads` once instead of `list_leads` followed by a `get_lead` per person - it returns a batch of the most-recently-updated leads with each one's recent notes, calls, texts, and emails already attached, pre-sorted by last activity. This is where motivation and timeframe usually live (a note about "ready in 2 months", a text reply, a favorited listing). Pass `excludeStages` (check exact names with `list_pipeline_stages` first) to skip stages like "Closed", "Trash", or "Not Interested" unless the user asks for those too.

If the user names someone specific instead of asking for a general review, use `search_leads` to find their `personId` and `get_lead` for their full history - `get_priority_leads` is for scanning the pipeline, not looking up one person.

`get_priority_leads` only aggregates and sorts by recency - it does not judge motivation or timeframe. Do not rely on stage/tags alone either; the value of this skill is reading the *activity* it returns, not just the fields.

## Scoring rubric

Score each lead independently on four factors, then assign a tier. Weigh **timeframe** and **recent engagement** most heavily - a lead that just re-engaged after a year of silence should score as high as a fresh lead with the same timeframe.

| Factor | Hot signal | Warm signal | Cool signal |
| --- | --- | --- | --- |
| Timeframe | Transacting in 0-30 days | Transacting in 1-3 months | 3+ months out or "someday" |
| Motivation | Clear, specific reason (relocating, under contract to sell, lease ending) | General interest, some urgency | Vague, browsing, no stated reason |
| Financing / ability | Pre-approved or cash buyer; seller with clear equity | Says they're "getting pre-approved" / "talking to lender" | No financing conversation yet |
| Recent engagement | Replied, called, favorited a listing, or asked a direct question in the last 7 days | Engaged in the last 30 days | No engagement in 30+ days, or never responded |

**Tiers:**

- **Hot** - ready to transact within ~30-60 days AND has engaged recently. These go at the top regardless of how old the lead record is (a lead from a year ago who just texted back is Hot).
- **Warm** - clear intent to transact in the next few months, or engaged recently but timeframe/financing still forming.
- **Cool / Housekeeping** - long-term nurture, or leads with an upcoming logistical event worth flagging (e.g. "visiting the area next week", "asked to reserve a day to meet") even if they aren't Hot/Warm buyers yet - these still need a touch, just not a sales push.

## Persist the tier

After scoring, call `tag_lead_priority` for each lead you placed in a tier - it sets a `Priority: Hot` / `Priority: Warm` / `Priority: Cool` tag on the person, replacing any previous priority tag rather than stacking duplicates. This is safe to re-run: each pass overwrites the prior tag with the current call, so the tag in FUB always reflects the last time this skill ran, not a stale one-time snapshot. Skip tagging only if the user explicitly asks for a read-only preview. Leads left off the list (nothing meaningful changed) don't need a `tag_lead_priority` call either way.

## Output format

Group by tier, and for each lead give: name, the one-line reason they're in that tier (cite the specific note/text/call that justifies it), and the suggested next action (call, text, send X). Keep it scannable - this replaces opening the FUB UI, so don't just dump raw JSON.

Example:

```
🔥 Hot
- Lily - reached back out after ~a year of silence, ready to buy in the next few months, asked for a fresh inventory list (sent). Follow up: confirm she got the list, ask about a showing.

🌤 Warm
- Anthony - new seller lead from ChatGPT ads, sent home valuation. Follow up: get him on the auto-drip sequence, check in in a few days.

🧊 Cool / Housekeeping
- Lucy - CA buyer, targeting a July move, likely traveling to Austin soon. Follow up: confirm travel dates, get something on the calendar.
- Yasmin - YouTube lead from San Jose, wants to reserve a day to meet in person. Follow up: nail down a date.
```

If nothing meaningful changed since the last review for a lead, it's fine to leave them off the list rather than padding it.

## Note on staleness

Because the tier gets written back as a tag, it can look authoritative in FUB's UI even after it's out of date. Encourage the user to re-run this regularly (daily, per the source video's workflow) rather than treating a tag from weeks ago as current - `tag_lead_priority` makes re-running cheap and safe precisely so this doesn't become stale.
