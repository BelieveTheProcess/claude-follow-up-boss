---
name: dealmachine-prospecting
description: Search DealMachine for motivated-seller property/owner leads (absentee owners, pre-foreclosure, vacant, high-equity, tired landlords, etc.) in a target area, then turn matches into deduplicated, tagged Follow Up Boss leads. Use when the user wants to prospect DealMachine for off-market deals and get results into FUB, not just look properties up.
---

# DealMachine Prospecting -> FUB

This skill uses this repo's own `dealmachine_*` tools (talking to DealMachine's REST API directly via `src/dealMachineClient.js`, authenticated with `DEALMACHINE_API_KEY`) together with the FUB tools (`search_leads`, `create_lead_event`, `add_note`, `list_action_plans`). It's the live-search counterpart to `expired-fsbo-prospecting`, which handles pasted/exported lists instead of an API search.

## Before spending any credits

Property-only searches (`contact_audience: "none"`, the default on `dealmachine_property_search`) are cheap; requesting owner contacts (`contact_audience: "owners"` or broader) spends people credits per match, and the `dealmachine_enrich_*` tools spend credits per lookup. Call `dealmachine_usage` first to confirm there's enough credit for what you're about to do, and `dealmachine_property_count` (free) to size a search before running it - never jump straight to a broad, contact-inclusive pull. Start with a small `per_page` and a narrow filter set, confirm the count/cost is reasonable, then widen if the user wants more.

## Useful filter_ids (from `dealmachine_filters`, source_type `properties`)

Known-good ones for motivated-seller signals, so you don't have to re-query `dealmachine_filters` every time:

| Signal | filter_id |
| --- | --- |
| Absentee / non-owner-occupied | `has_absentee_owners`, `has_out_of_state_owners` |
| Long-term landlord who may want out | `has_tired_landlords` |
| Vacant | `is_vacant_home`, `is_zombie_property` |
| Foreclosure distress | `is_preforeclosure`, `foreclosure_status`, `foreclosure_auction_date` |
| Equity position | `estimated_equity_amount`, `estimated_equity_percentage`, `is_free_and_clear` |
| Ownership entity | `is_corporate_owned`, `ownership_entity_type` |
| Condition | `building_condition` (categorical: Excellent/Very Good/Good/Average/Fair/Poor/Unsound), `building_quality` (assessor grade A+ through E-) |

Call `dealmachine_filters` (with `search`) for anything not on this list, and `dealmachine_fields` to see what a search actually returns. Call `dealmachine_location_search` to resolve a city/county/ZIP name to the location code `dealmachine_property_search` needs - never guess a location code.

## Workflow

1. **Scope it.** Confirm the target area and which signal(s) to filter for - don't default to a wide, unfiltered pull. Resolve the area with `dealmachine_location_search` first.
2. **Size it for free.** Run `dealmachine_property_count` with the chosen `locations`/`filters` to see how many properties match before spending anything. If a filter combo is very broad (e.g. `building_condition` alone across a whole county can match thousands - assessor condition data is often a coarse bucket, not a precise per-property inspection), narrow further (add an ownership/distress signal, or an equity floor) rather than pulling a huge page.
3. **Pull property-only first** (`dealmachine_property_search` with `contact_audience: "none"`, the default) to review candidates before spending contact credits. Watch for low-quality records - "LAND ONLY" addresses, `living_area_sqft: 0` with no `year_built` - these are typically vacant-land or data-gap records miscategorized as the requested property type, not real distressed homes; filter them out before treating them as candidates.
4. **Pull owner contact per candidate** with `dealmachine_property_get` (`contact_audience: "owners"`) once you've picked real candidates - cheaper and more targeted than requesting contacts on the whole search page. Re-check `building_condition` on this detail call - it can occasionally come back `null` here even when the property matched the filter at search time; treat those as lower-confidence rather than asserting the condition as fact.
5. **Dedupe against FUB.** `search_leads` for each candidate before creating anything - DealMachine pulls will overlap with people already prospected via `expired-fsbo-prospecting`, prior DealMachine runs, or other sources. Check by name, phone, and email.
6. **Check DNC before anyone actually gets contacted.** Run `dealmachine_check_dnc` on a phone number before it's used for a call/text - storing it on the FUB record first is fine, dialing it isn't until it's been checked. A contact's inline `do_not_call` flag on the enrichment response is a useful first signal but re-verify with `dealmachine_check_dnc` before relying on it for anyone you're actually about to call.
7. **Create via `create_lead_event`, not `add_lead`**, so routing/Action Plans fire - set `source` to a value that matches a configured FUB Lead Source (confirm the exact label with the user the first time; something like `"DealMachine"` or split by signal, e.g. `"DealMachine - Preforeclosure"`). Follow with `add_note` capturing the specific qualifying signal (equity %, condition, vacant, tired landlord, auction date, etc.), any DNC status found, and the DealMachine property/person id for reference.
8. **Don't auto-enroll in an Action Plan.** Offer `list_action_plans` and let the user choose - an investor/wholesale pitch to a pre-foreclosure owner is not the same script as a homebuyer/seller drip.

## Compliance - read before contacting anyone this pulls in

Same posture as `expired-fsbo-prospecting`, plus one more layer: these are cold, off-market prospects who haven't opted into anything, so DNC/TCPA exposure applies same as always - always `dealmachine_check_dnc` first. Pre-foreclosure owners specifically carry additional state-level restrictions in a number of states on who may contact a homeowner in default and how ("foreclosure consultant" / equity-purchaser statutes, mandatory disclosures, cooling-off periods) - this varies by state and is a real legal question, not something to infer from this doc. Confirm outreach method and any state-specific pre-foreclosure contact rules with your broker/compliance counsel before a live campaign, not after pulling the list.

## Output

A table: address, owner name (if available), the qualifying signal(s), estimated equity/value if pulled, DNC status if a phone was checked, and result - new lead created / already in FUB (skipped, linked to the existing personId) / needs a source-label decision before it can trigger routing.
