---
name: dealmachine-prospecting
description: Search DealMachine for motivated-seller property/owner leads (absentee owners, pre-foreclosure, vacant, high-equity, tired landlords, etc.) in a target area, then turn matches into deduplicated, tagged Follow Up Boss leads. Use when the user wants to prospect DealMachine for off-market deals and get results into FUB, not just look properties up.
---

# DealMachine Prospecting -> FUB

This skill combines DealMachine (via the Zapier connector enabled separately in your Claude account - not part of this repo's MCP server) with this repo's own Follow Up Boss tools (`search_leads`, `create_lead_event`, `add_note`, `list_action_plans`). It's the live-search counterpart to `expired-fsbo-prospecting`, which handles pasted/exported lists instead of an API search.

## Before spending any credits

Every DealMachine `property_search`, `people_search`, and `enrich_*` call can cost credits. Build the search, run it once with `estimate_cost: true`, and show the user the projected cost and record count **before** running it live. Never jump straight to a live search on a broad area - start with a small radius/filter set, confirm the cost is reasonable, then widen if the user wants more.

## Useful filter_ids (from `list_filters`, source_type `properties`)

Known-good ones for motivated-seller signals, so you don't have to re-query `list_filters` every time:

| Signal | filter_id |
| --- | --- |
| Absentee / non-owner-occupied | `has_absentee_owners`, `has_out_of_state_owners` |
| Long-term landlord who may want out | `has_tired_landlords` |
| Vacant | `is_vacant_home`, `is_zombie_property` |
| Foreclosure distress | `is_preforeclosure`, `foreclosure_status`, `foreclosure_auction_date` |
| Equity position | `estimated_equity_amount`, `estimated_equity_percentage`, `is_free_and_clear` |
| Ownership entity | `is_corporate_owned`, `ownership_entity_type` |

Call `list_filters` (with `search`) for anything not on this list, and `list_fields` to see what a search actually returns.

## Workflow

1. **Scope it.** Confirm the target area (state/county/city/ZIP, or lat/lng + radius) and which signal(s) to filter for - don't default to a wide, unfiltered pull.
2. **Preview cost.** Run `property_search` (or `people_search`) with `filters_json` set for the chosen signals and `estimate_cost: true`. Show the user the projected credit cost and result count. Get their go-ahead before anything beyond a small test batch.
3. **Run it live** (`estimate_cost: false`), with `contact_audience: "owners"` so contact info comes back with each property.
4. **Dedupe against FUB.** `search_leads` for each result before creating anything - DealMachine pulls will overlap with people already prospected via `expired-fsbo-prospecting` or other sources.
5. **Check DNC before anyone actually gets contacted.** Run `check_dnc` on a phone number before it's used for a call/text - storing it on the FUB record first is fine, dialing it isn't until it's been checked.
6. **Create via `create_lead_event`, not `add_lead`**, so routing/Action Plans fire - set `source` to a value that matches a configured FUB Lead Source (confirm the exact label with the user the first time; something like `"DealMachine"` or split by signal, e.g. `"DealMachine - Preforeclosure"`). Follow with `add_note` capturing the specific qualifying signal (equity %, vacant, tired landlord, auction date, etc.) and the DealMachine `property_id`/`person_id` for reference.
7. **Don't auto-enroll in an Action Plan.** Offer `list_action_plans` and let the user choose - an investor/wholesale pitch to a pre-foreclosure owner is not the same script as a homebuyer/seller drip.

## Compliance - read before contacting anyone this pulls in

Same posture as `expired-fsbo-prospecting`, plus one more layer: these are cold, off-market prospects who haven't opted into anything, so DNC/TCPA exposure applies same as always - always `check_dnc` first. Pre-foreclosure owners specifically carry additional state-level restrictions in a number of states on who may contact a homeowner in default and how ("foreclosure consultant" / equity-purchaser statutes, mandatory disclosures, cooling-off periods) - this varies by state and is a real legal question, not something to infer from this doc. Confirm outreach method and any state-specific pre-foreclosure contact rules with your broker/compliance counsel before a live campaign, not after pulling the list.

## Output

A table: address, owner name (if available), the qualifying signal(s), estimated equity/value if pulled, and result - new lead created / already in FUB (skipped, linked to the existing personId) / needs a source-label decision before it can trigger routing.
