---
name: openhouse-followup
description: Turn an open house sign-in sheet (names/phones/emails, or a photo of the sheet) into logged Follow Up Boss leads with a same-day follow-up plan. Use whenever the user says they just held an open house, has a sign-in sheet to process, or asks how to follow up with open house visitors.
---

# Open House Follow-Up

Open house visitors go cold fast - most agents lose them by not logging and following up the same day. This skill turns a sign-in sheet (typed list or a photo of the physical sheet) into FUB records plus a ready-to-send first touch, so nobody falls through.

Read `BRAND.md` at the repo root first for voice/tone rules before drafting any message. If it's not filled in yet, ask for the missing basics (tone, CTA style) rather than guessing.

## Workflow

1. **Parse the sign-in sheet.** Extract each visitor's name, phone/email, and any notes they left (e.g. "looking to buy in spring", "just curious", "already working with an agent"). If handwriting is ambiguous, flag it rather than guessing at a name or number.

2. **Dedupe against FUB.** For each visitor, call `search_leads` (by name/phone/email). If they already exist, use `add_note` to log the open house visit on their existing record instead of creating a duplicate.

3. **Create new leads.** For visitors with no match, call `add_lead` with `source: "Open House - <property address>"`, `tags: ["Open House"]` (plus `["Buyer"]`/`["Seller"]` if stated), and a `background` summary of anything they said on-site.

4. **Log the visit as a note.** For every visitor (new or existing), `add_note` with the property address, date, and anything specific they mentioned - this is what `fub-lead-scoring` will read later to judge motivation.

5. **Flag the ones already working with an agent.** Note this explicitly rather than pushing a sales follow-up - a light "great meeting you" touch is appropriate, not a full nurture sequence.

6. **Draft same-day follow-up.** For everyone else, draft a short first-touch text and/or email per visitor (in the voice from `BRAND.md`) referencing the specific property and whatever they said on-site - not a generic "thanks for stopping by." If the user has `send_text` configured (Twilio), offer to send directly; otherwise hand back the drafts.

7. **Offer a sequence.** If an appropriate Action Plan already exists (check with `list_action_plans`), offer to enroll qualified visitors via `apply_action_plan`.

8. **Review queue (optional).** If `notify_slack` is configured, post the batch of drafted follow-ups to the `marketing-review` (or user-specified) channel before anything is sent, rather than sending unreviewed messages on a first run.

## Output

Give a short summary table: visitor name, new vs. existing FUB record, tags applied, and what follow-up was drafted/sent. Don't dump raw FUB JSON responses.
