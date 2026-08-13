---
name: stale-lead-revival
description: Find leads in Follow Up Boss that have gone quiet and draft a win-back touch for each, with a follow-up task created so it actually gets sent. Use when the user asks to revive old/cold leads, clean up their pipeline, or find leads they've forgotten about.
---

# Stale Lead Revival

Leads don't die, they just get buried under newer ones. This skill finds pipeline leads with no recent activity and gives each one a genuine, specific reason to be worth a touch again - the same pattern that turned a year-old lead into a hot one in the reference workflow (a quiet lead who resurfaces after re-engaging jumps straight to the top of the list).

Read `BRAND.md` for voice before drafting any message.

## Workflow

1. **Pull the working pipeline.** Call `list_leads` with `sort: "updated"` (ascending - oldest-updated first) across active stages, excluding closed/trash/not-interested stages. Look at the `updated` timestamps to identify leads with no activity in roughly 60+ days (adjust the threshold based on what the user says counts as "gone quiet" for their business).

2. **Don't blast the whole list uniformly.** For each stale lead, call `get_lead` and read their history - motivation, timeframe, what they last said - the same way `fub-lead-scoring` does. A lead who said "not for another year" nine months ago deserves a different message than one who went quiet mid-conversation with no explanation.

3. **Skip leads that shouldn't be revived**: already under contract elsewhere, explicitly asked not to be contacted, or marked Not Interested/Trash (these shouldn't have been in the pipeline pull, but double check).

4. **Draft a specific re-engagement message per lead**, referencing something real from their history (their stated goal, the area they liked, what they asked about) - never a generic "just checking in." Per `BRAND.md`'s communication rules, end with a low-pressure question that invites a reply.

5. **Create a follow-up task** via `add_task` for each one (`type: "Follow Up"`, due today or tomorrow) so the revival attempt is tracked in FUB, not just suggested in chat.

6. **Send or queue for review.** If `send_text` is configured and the user wants to go straight to sending, offer it. Otherwise, or for email-length messages, route the batch through `notify_slack` (see `skills/slack-review-queue`) for a review pass before anything goes out - first-touch-after-a-long-gap messages are worth a human glance.

## Output

A table: lead name, how long they've been quiet, the one-line reason they're worth reviving (or why to leave them alone), and what was drafted/tasked. Keep the count reasonable per run (e.g. top 10-15) rather than dumping the entire cold pipeline at once.
