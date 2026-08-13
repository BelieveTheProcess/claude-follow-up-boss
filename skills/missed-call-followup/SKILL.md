---
name: missed-call-followup
description: Find recent unanswered/missed calls across the whole Follow Up Boss pipeline and draft a same-day "sorry I missed you" text for each. Use when the user asks about missed calls, unanswered calls, or wants to catch up on calls that didn't connect.
---

# Missed Call Follow-Up

A call that rings through with no answer and no follow-up is a lead who tried to reach out and got silence back. This skill finds those gaps across the whole pipeline (not just one lead at a time) and turns each into a quick, specific text.

## Workflow

1. **Pull recent calls.** Call `list_calls` with no `personId` (to scan the whole pipeline) and a reasonable `limit` (e.g. 50) for calls in the lookback window the user cares about (default: today, or "since I last checked").

2. **Identify the misses.** A call is worth following up on if `outcome` indicates no real conversation happened (e.g. "No Answer", "Left Message", `duration` near 0) - not calls that were clearly connected and had a real conversation logged.

3. **Get context per lead.** For each missed call's `personId`, call `get_lead` to see if there's already a note/text about it, and to pull enough context (name, what they're looking for, if known) to make the follow-up specific rather than generic.

4. **Draft the text.** Short, same-day, acknowledges the missed call by name if it was inbound ("Sorry I missed your call!") or explains the reason for the outbound attempt if it was you calling them ("Tried reaching you about..."). Follow `BRAND.md` for tone; end with an easy way to reconnect (a time that works, or "text me back whenever").

5. **Send or queue.** If `send_text` is configured, offer to send directly. Otherwise hand back the drafts, and offer to route them through `notify_slack` for review if there are several.

6. **Task it.** For calls that still need an actual phone follow-up (not just a text), create a task via `add_task` (`type: "Call"`) so it's tracked, not just texted-and-forgotten.

## Output

A short table: lead name, when the call was missed, who called whom, and what was drafted/sent/tasked. If there are zero misses in the window, say so plainly rather than padding the response.
