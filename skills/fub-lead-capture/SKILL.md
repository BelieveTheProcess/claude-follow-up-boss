---
name: fub-lead-capture
description: Add a new lead to Follow Up Boss from a screenshot of a text/email/DM conversation, or from a quick spoken/typed note, instead of manually entering it in the CRM. Use whenever the user says "add this to FUB", "add this lead", pastes/attaches a screenshot with that intent, or dictates contact details to be saved.
---

# Follow Up Boss Lead Capture

Real leads show up as a random text, a screenshot of a conversation, or a quick verbal note - not a clean form. This skill turns that raw input directly into a Follow Up Boss person record, so it never has to be manually retyped into the CRM.

## Workflow

1. **Extract the facts.** From a screenshot (text thread, email, DM) or dictated note, pull out:
   - Name (first/last if available - if only a first name or nickname is visible, use that and note the ambiguity)
   - Phone number and/or email
   - Any stated intent: buying, selling, timeframe, price range, area of interest
   - Source, if inferable (e.g. "came in from a YouTube video", "met at an open house") - otherwise leave blank rather than guessing
   - The full conversation text/context worth preserving

2. **Check for an existing record first.** Call `search_leads` with whatever identifiers you have (name, phone, or email). If a match exists, don't create a duplicate - use `add_note` to attach the new context to the existing person instead, and tell the user you found an existing match.

3. **Create the lead.** If no match, call `add_lead` with the extracted fields. Use `background` for a short structured summary (not the full raw transcript) and set `tags` if the user's intent maps to something like `["Buyer"]`, `["Seller"]`, or a lead-source tag.

4. **Log the raw context as a note.** Call `add_note` on the new (or existing) person with the full screenshot transcript / dictated details as the note body, so nothing is lost even if your extraction missed something. Give the note a short `subject` like "Captured from screenshot" or "Captured from voice note".

5. **Multiple contacts in one batch.** If the user provides several screenshots or people at once, repeat steps 1-4 for each one independently - don't merge separate people into a single record.

6. **Confirm back concisely.** Report what was created/updated: name, personId, and a one-line summary of what was captured. Don't echo the full JSON response unless asked.

## Notes

- Never fabricate a phone number, email, or last name that isn't actually present in the source material - leave the field blank instead.
- If the screenshot/note contains a stated future timeframe (e.g. "looking to buy in 2028"), put it in `background` verbatim so `fub-lead-scoring` can pick it up later - don't try to score the lead as part of this workflow.
- Adding a person this way does **not** trigger FUB's lead-routing automations or Action Plans (that only happens via the `/events` endpoint from a registered source). If the user wants the new lead enrolled in a follow-up sequence, use `list_action_plans` + `apply_action_plan` as a separate step.
