---
name: consultation-prep-sheet
description: Build a prep sheet for an upcoming listing appointment or buyer consultation from a lead's Follow Up Boss history. Use when the user has a consultation, listing appointment, or buyer meeting coming up and wants to prep.
---

# Consultation Prep Sheet

Turn a lead's full FUB history into a one-page prep sheet before a listing appointment or buyer consultation, so the agent walks in already knowing the person's situation instead of re-asking basics.

## Workflow

1. **Identify the lead.** Use `search_leads` if you only have a name/phone, then `get_lead` to pull their full profile, notes, calls, texts, and emails.

2. **Summarize the situation** from that history:
   - Why they're moving (motivation) - cite the specific note/message it came from.
   - Timeframe, as best known.
   - For sellers: property details already on file, any mentioned equity/mortgage situation, prior valuation conversations.
   - For buyers: price range, must-haves, financing status (pre-approved? with which lender, if mentioned?), areas of interest.
   - Any objections or hesitations already raised in past conversations - don't let the agent get blindsided by something the lead already said.
   - Communication preference/style, if it's inferable (short texter vs. long emailer, responsive vs. slow).

3. **Flag gaps**, not just what's known - list the questions still open (e.g. "financing status unclear - confirm pre-approval", "hasn't said why they're selling now") so the agent knows what to ask in the meeting.

4. **Structure the output** as a scannable one-pager:
   - Snapshot (name, stage, timeframe, motivation - one line each)
   - Background summary (2-4 sentences)
   - Key facts (bullets)
   - Open questions to ask in the meeting (bullets)
   - Suggested angle/talking points for this specific person, not a generic script

5. **Offer to log the appointment.** After the meeting, offer to capture outcomes back into FUB via `add_note` so the next prep sheet (or `fub-lead-scoring` run) has it.

Keep the whole sheet skimmable in under a minute - this is meant to be read in the car before walking in, not studied.
