---
name: titletoolbox-import
description: Import a farm/property list or Property Profile export from Title Toolbox (or a similar title-company property data tool) into Follow Up Boss as person records. Use when the user has exported/uploaded a CSV, Excel, or PDF property list from Title Toolbox (or mentions Title Toolbox, a farm export, or a property owner list) and wants it in FUB.
---

# Title Toolbox Import

There's no live API integration between this server and Title Toolbox (it requires a Benutech partner key and is a browser-embedded SDK, not a server-side API this repo can call - see the README if that changes later). This skill instead takes the file the user already exports from the Title Toolbox dashboard (Excel/CSV farm list, or a PDF Property Profile) and turns it into real FUB records, so the manual re-typing step disappears even without a live connection.

## Important: this is not consent to contact anyone

A Title Toolbox farm or Property Profile is public-record property/ownership data - owner name, site address, mailing address, sometimes mortgage/equity info. **None of that implies the owner has consented to be texted, emailed, or called.** Importing these people into FUB is fine; treat any actual outreach to them the same as `distressed-seller-outreach` already requires - TCPA consent before texting, DNC checks before calling, and (if this happens to be a pre-foreclosure/default farm specifically) the state foreclosure-consultant law caveat in that skill. Say this explicitly if the user asks to import-and-immediately-text/email in the same request.

## Workflow

1. **Read the file.** For a spreadsheet export (.csv/.xlsx), use the `xlsx` skill to open it. For a PDF Property Profile, use the `pdf` skill to extract the text/tables. Don't assume fixed column names - Title Toolbox's export layout isn't fully documented here, so inspect the actual headers/fields in this specific file first.

2. **Map columns to FUB fields, and show the mapping before doing anything else.** Typical fields to look for: owner first/last name, site/situs address, mailing address (often different from site address for absentee owners - worth keeping both), APN/parcel number, phone/email if the export includes skip-traced contact info, and any equity/mortgage/last-sale data. Present the mapping you inferred (e.g. "Owner Name -> firstName/lastName, Situs Address -> background") and get a quick confirmation before importing, especially if any column is ambiguous - don't guess silently on a bulk operation like this.

3. **Show the count and get confirmation before creating anything**, the same way DealMachine's own tools require confirming before a large export. For more than ~10 records, summarize (row count, what farm/area this is, date) and wait for a go-ahead rather than importing hundreds of records unprompted.

4. **Decide tagging and stage before importing, not per-record.** These are property owners from a farm list, not people who've raised their hand - mixing them into the same pipeline stage as real inbound leads will skew `fub-lead-scoring` and `get_priority_leads`. Ask the user (or use `list_pipeline_stages` to suggest) a distinct stage or tag for farm/prospect records, e.g. tag `"Title Toolbox Farm"` plus the specific farm name/area if given (e.g. `"Farm: Golden Beach"`), so they're identifiable and groupable later - `weekly-market-update`'s farm-area segmentation and `distressed-seller-outreach` both key off tags like this.

5. **Import row by row:**
   - Call `search_leads` first (by name and/or address) to check for an existing record - title farms often overlap with people already in the pipeline from other sources. If found, use `update_lead` (`mergeTags: true`) to add the farm tag rather than creating a duplicate.
   - If no match, call `add_lead` with the mapped fields, the farm/prospect tag(s) from step 4, and `background` set to a short structured summary (site address, APN, any equity/mortgage figures) - not a dump of the raw row.
   - `add_lead` does not trigger Action Plans or lead-routing automations - that's expected here, these aren't inbound leads.

6. **Report back a summary**, not a per-row dump: total rows processed, how many created vs. matched-existing, any rows skipped (and why - e.g. no name/address to key off of), and the tag(s) applied. Offer the count as a data point for a future `distressed-seller-outreach` or `weekly-market-update` run, but don't start drafting outreach as part of this skill - importing and contacting are separate steps with separate compliance considerations (see above).

## Notes

- Never fabricate a phone number, email, or any field not actually present in the export - leave it blank. Skip-traced contact info specifically should only be trusted as accurate as the source Title Toolbox report claims it is; don't upgrade a "possible" or low-confidence match to a definite phone/email.
- If the same file has both a mailing address and a site address for an absentee owner, keep both distinguishable in `background` - conflating them is a common way outreach ends up going to the wrong place.
- If this becomes a recurring workflow (the same farm re-exported monthly to catch new owners/status changes), say so and this skill can be adjusted to diff against what's already tagged in FUB instead of re-checking every row via `search_leads`.
