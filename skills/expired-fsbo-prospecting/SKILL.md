---
name: expired-fsbo-prospecting
description: Turn MLS-scraped or manually pasted expired listings and FSBO (For Sale By Owner) prospects into tracked, deduplicated Follow Up Boss leads with the right source tags - so prospecting pulled from a browser MLS session or a copy-pasted export lands in the pipeline instead of sitting in a chat. Use when the user pastes or uploads a list of expired listings, FSBOs, or other off-market prospects.
---

# Expired & FSBO Prospecting Intake

## Input

Accept whatever the user provides - a screenshot, a pasted MLS export, a CSV - and expect it to be messy. At minimum you need an address; owner name, phone, email, list price, and days-on-market/expiration date are all bonuses, not requirements. Log what's actually there rather than blocking on what's missing.

## Workflow

1. **Deduplicate first.** Before creating anything, call `search_leads` per prospect (by name if you have one, otherwise whatever identifying info is available) to avoid creating a duplicate person for someone already in FUB - expireds and FSBOs are especially likely to already be a stale record from a prior prospecting list.
2. **Create via `create_lead_event`, not `add_lead`,** for genuinely new prospects - set `source` to a value that exactly matches a configured Lead Source in FUB's Lead Flow admin, since only an exact match triggers routing/Action Plan enrollment (see the README's notes on this). Confirm with the user which source label to use for "Expired" vs "FSBO" the first time - don't guess. `add_lead` is the fallback only if the user explicitly wants a silent add with no automation.
3. **Log what didn't fit a field.** Immediately follow with `add_note` capturing list price, expiration date, why it expired if known, or the FSBO ad's asking price/description - this is often the most useful context for the first call.
4. **Don't auto-enroll in an Action Plan.** Offer `list_action_plans` and let the user pick - an "Expired" script and a general buyer/seller drip are different conversations. Use `apply_action_plan` only once they've confirmed which one.

## Compliance - read before contacting anyone from this list

Expired listings and FSBOs are two of the most heavily regulated prospecting categories in real estate: many numbers on these lists are on the National Do Not Call Registry, and outbound text/calls to them carry real TCPA exposure - these prospects did not opt in to anything, unlike the inbound leads `speed-to-lead` reacts to. This skill only gets prospects into FUB with the right notes and tags; it drafts and sends nothing, and should not be extended to auto-text this list the way `speed-to-lead`'s optional auto-text works for inbound leads. Scrub against the DNC registry and confirm the outreach method (mailer, ringless voicemail, live call, etc.) with your broker/compliance counsel before contacting anyone this skill adds.

## Output

A table: address, name (if known), source (Expired/FSBO), and result - new lead created, already in FUB (skipped, linked to the existing personId), or needs a source-label decision before it can trigger routing.
