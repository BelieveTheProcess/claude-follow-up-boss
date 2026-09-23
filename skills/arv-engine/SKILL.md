---
name: arv-engine
description: Estimate After-Repair Value (ARV), rehab cost, and Maximum Allowable Offer (MAO) for a property from sold comps, then flag whether the deal passes QA or needs human review. Use when the user asks what a property is worth fixed up, wants comps/ARV/MAO/offer price on an address or MLS listing, is deciding whether to send an offer to a listing agent, or is running the daily agent-to-investor deal pipeline.
---

# ARV Engine

The pricing hub of the agent-to-investor pipeline (see `docs/agent-investor-pipeline.md`). Every deal source (Redfin/DealMachine pulls, Gold Miner, probate, reruns) comes through here, so every deal is priced **the same way**. Input is one or more addresses. Output is ARV, rehab estimate, MAO, a confidence grade, and a pass / review / kill verdict.

It never sends an offer itself. It prices, then hands off.

## Default assumptions (override per user or market)

Before the first run, ask the user to confirm or change these. Once confirmed, state them at the top of every output so the numbers can be audited later.

| Setting | Default | Notes |
|---|---|---|
| MAO formula | `ARV × 70% − Rehab` | Flip rule. Use 75–80% in hot, low-price-point markets. |
| Wholesale fee (if assigning) | $10,000 | Subtracted from MAO: `MAO_assign = MAO − fee` |
| Comp radius | 0.5 mi (urban/suburban), 1 mi (rural), 2 mi max | Widen one step only when fewer than 3 comps are found |
| Comp recency | 6 months (widen to 12 only if needed) | |
| Size tolerance | ±20% sqft, ±1 bed, ±1 bath | |
| Same property type | Required | SFR ≠ townhome ≠ condo |
| Rehab $/sqft tiers | Cosmetic $20 · Medium $40 · Heavy $65 · Gut $90+ | Local labor costs vary a lot, so the user should set these for their market |
| High-cost market override | SF Bay Area / NYC / Seattle / LA: roughly 2× the tiers above | Medium Bay Area rehab typically runs $80–100/sqft |

## Step 1: Pull the subject property

- **DealMachine:** `dealmachine_enrich_address` (or `dealmachine_property_get` with `contact_audience: "none"` and `enrich: false` first, which uses no credits) for beds, baths, sqft, year built, lot, property type, last sale, and AVM.
- **HouseCanary sidecar** (if connected): the property-details and value endpoints. Tool names come from the package, so list them first and don't guess.
- **Off-market property** (no active listing): there's no list price, DOM, or remarks. Compare the offer to the as-is AVM instead of list price, and treat condition as unknown. Also look at the unrenovated comps: they show what the house is worth as-is today. There's no listing agent, so a direct-to-owner approach falls under `skills/distressed-seller-outreach` and its compliance gate, not the Offer Sender.
- **MLS listing** (if the deal came from Redfin): list price, days on market (DOM), price history, and **public remarks**. Remarks are the main input for condition and rehab level.

Check credits with `dealmachine_usage` before any batch over 10 properties. Comps cost 1 credit per subject.

## Step 2: Pull and filter comps

Call `dealmachine_comps` with `property_ids` (up to 25 per call) and criteria that match the defaults, e.g.:

```json
{
  "criteria": {
    "timeframe": "6months",
    "sqft_tolerance_percent": 20,
    "bedroom_tolerance": 1,
    "bathroom_tolerance": 1,
    "match_property_type": true,
    "include_active_listings": true,
    "include_pending": true,
    "include_foreclosures": false,
    "sort_by": "match",
    "limit": 25
  },
  "location": { "type": "radius", "latitude": 0, "longitude": 0, "radius_miles": 0.5 }
}
```

Cross-check with HouseCanary comps/AVM when the sidecar is available.

**Keep only renovated or top-condition sold comps for ARV.** ARV is what the house sells for *after* repairs, so averaging in distressed sales drags it down. Treat a comp as "renovated" when its remarks or photos say updated, remodeled, new kitchen, turnkey, and so on, or when its $/sqft is in the top third of the set.

**Throw out:**
- foreclosure / REO / short sales, and non-arm's-length sales ($0, family transfers)
- sales across a major boundary: highway, school district, or a clearly different subdivision
- $/sqft outliers more than 25% from the median of the rest

Use actives and pendings only as a **ceiling check** (ARV shouldn't be above what renovated actives are listed at). Never use them as ARV comps.

## Step 3: Calculate ARV

1. Take the best **3–5** renovated sold comps.
2. Adjust each comp's **sale price** to the subject (grid method). Use these rough defaults and say they're rough:
   - sqft: `(subject sqft − comp sqft) × marginal $/sqft`, where marginal $/sqft ≈ **50% of the comps' median $/sqft**. Do **not** use `comp $/sqft × subject sqft`: smaller homes sell for more per sqft, so scaling them up overstates ARV. In the first live test it produced $1.60M from a comp that actually sold for $1.355M, above every sale in the set.
   - bed: ±$5–10k · bath: ±$5–10k · garage: ±$5–15k · pool: +$0–15k by market
   - Scale bed/bath adjustments up in high-price markets (over $1M), where $5–10k is too small to matter.
3. ARV = **median** of the adjusted values. The median resists a single outlier better than the mean.
4. Show the range too (low adjusted to high adjusted).

## Step 4: Estimate rehab

Pick a tier from listing remarks, year built, and whatever photos or notes exist:

| Signals | Tier |
|---|---|
| "Needs cosmetic", "TLC", paint/flooring, dated but functional | Cosmetic |
| "Needs updating", original kitchen/baths, 1970s–90s with no updates | Medium |
| "As-is", "cash only", "investor special", roof/HVAC/foundation mentioned | Heavy |
| "Fire damage", "uninhabitable", "tear-down", major structural problems | Gut / land value |

Rehab = tier $/sqft × sqft, plus big-ticket items that are called out: roof $8–15k, HVAC $6–12k, foundation $10k+. If condition is unknown, **price it Medium and mark confidence down**. Never assume Cosmetic without evidence.

## Step 5: Compute MAO and the spread

```
MAO          = ARV × 0.70 − Rehab          (or the user's %)
MAO_assign   = MAO − wholesale fee          (only if assigning)
Offer % of list = MAO / list price
Equity spread   = ARV − (MAO + Rehab)
```

## Step 6: Confidence and QA verdict (QA Agent gate)

**Confidence grade**
- **A**: 4+ renovated sold comps within 0.5 mi and 6 mo, $/sqft spread under 15%, condition known.
- **B**: 3 comps, or radius/time had to be widened once, or condition inferred from remarks only.
- **C**: fewer than 3 comps, spread over 25%, mixed property types, rural, or condition unknown.

**Verdict**
- ✅ **PASS**: can go to the Offer Sender. Needs grade A or B, `Offer % of list` ≥ 55%, and ARV within 10% of the HouseCanary/DealMachine AVM (or no AVM available).
- 🟡 **REVIEW**: goes to Slack via `notify_slack` (channel label from `SLACK_WEBHOOKS`, e.g. `"deal-review"`, per `skills/slack-review-queue`). Triggers: grade C, ARV more than 10% from the AVM, offer under 55% of list (the listing agent will likely ignore it), heavy or gut rehab, or any major-system item.
- ❌ **KILL**: MAO ≤ 0, or MAO under 40% of list with no strong distress signal. Log it and don't offer.

Always show *why* a deal got its verdict. One line per rule that fired.

## Step 7: Persist to Follow Up Boss

For PASS and REVIEW deals:
1. `search_leads` on the listing agent's email/phone (or the property address) to avoid duplicates.
2. If there's no match, `add_lead` for the listing agent, tagged `Deal: <address>` and `ARV Engine`.
3. `add_note` with the full output block below, so the numbers sit on the lead's timeline.
4. Set the stage with `update_lead` (e.g. "Offer Pending Review" or "Ready to Offer"). Check real stage names with `list_pipeline_stages` first.

Skip this step if the user asks for a quick read-only estimate.

## Output format

One block per property. Keep it scannable:

```
🏠 123 Main St, Austin TX 78745 — 3bd/2ba · 1,450 sqft · 1978 · SFR
List $265,000 · DOM 94 · 2 price drops
Assumptions: 70% rule · Medium rehab $40/sqft · 0.5 mi / 6 mo

ARV            $355,000   (range $340k–$368k, 4 renovated comps)
Rehab          $62,000    (Medium: original kitchen/baths; roof +$4k)
MAO            $186,500   (70% × 355k − 62k)
Offer % list   70%
Confidence     B — condition from remarks only
Verdict        ✅ PASS

Comps used
- 118 Oak Ln · sold 07/2026 · $362k · $246/sqft · 0.2 mi · remodeled
- 204 Elm St · sold 05/2026 · $349k · $238/sqft · 0.4 mi · updated kitchen
- ...
Excluded: 311 Pine (REO), 9 Birch ($/sqft outlier)
```

For a batch, lead with a summary table (address · ARV · MAO · offer % · grade · verdict) sorted by verdict and then spread, and put the per-property blocks under it.

## Guardrails

- These are **investor estimates, not appraisals**, and must not be presented to sellers or agents as an appraisal or a broker price opinion. If the user is a licensed agent buying for their own account, they should disclose their license status in the offer, as most state license laws and the NAR Code require. Say so when handing off to the Offer Sender.
- Never invent comps. If DealMachine or HouseCanary return nothing usable, say so and return grade C / REVIEW, not a guessed number.
- Show every assumption. Someone should be able to recompute the MAO by hand from the output.
