---
name: listing-description-writer
description: Write an MLS/listing description from property facts and photos, in the agent's own voice, avoiding real-estate cliches. Use whenever the user shares a new listing's details/photos and wants a description written, or asks to update one.
---

# Listing Description Writer

Draft a listing description from whatever facts the user provides (address, beds/baths, sqft, lot size, key features, recent updates, neighborhood) and, if shared, the listing photos - without slipping into generic real-estate copy.

Read `BRAND.md` at the repo root first. In particular:
- Match the reading level and paragraph-length rules there.
- Avoid every word/phrase on the "words to avoid" list (cozy, charming, nestled, hidden gem, must-see, boasts, etc.) - these show up by default in AI-generated listing copy, so actively check the draft against that list before returning it.
- If `BRAND.md` names farm areas/neighborhoods and this listing is in one of them, lean into the specific local knowledge (walkability, schools, nearby landmarks) rather than describing the neighborhood generically.

## Workflow

1. **Gather facts.** Confirm you have: address, price (if to be included), beds/baths, square footage, lot size, year built, standout features, and any recent renovations/updates. If photos are provided, look for details worth calling out (updated kitchen, natural light, outdoor space, view) - don't invent features not visible or stated.

2. **Lead with what's genuinely distinctive**, not a generic opener. Two or three sentences establishing what makes this specific property worth a showing, then structured detail (layout, standout rooms, systems/updates, lot/outdoor space), then a closing line ending in a soft call-to-action per `BRAND.md`'s communication rules (e.g. inviting a showing request or a question).

3. **Produce two lengths** unless told otherwise: a full MLS-length description (~150-250 words) and a short version (~40-60 words) for social captions/flyers.

4. **Fact-check against the input** before returning - every claim in the draft should trace back to something the user actually told you or that's visible in a provided photo.

5. **Offer to log it.** If this listing corresponds to a seller lead already in FUB, offer to attach the final description to their record via `add_note` (subject: "Listing description - <address>") so it's on file.
