---
name: daily-crm-debrief
description: Pull one morning snapshot of the Follow Up Boss pipeline - tasks due/overdue, Hot/Warm leads worth a touch, and calls missed in the last 24 hours - and post it as a single scannable Slack briefing. Use when the user asks for a daily recap, morning briefing, or "what needs my attention today" without wanting to open FUB directly.
---

# Daily CRM Debrief

The FUB equivalent of a Gmail/Calendar morning debrief: instead of opening the CRM and checking three different views, one message tells you what already needs a reply, who's worth a touch, and what fell through overnight.

## What to pull

Combine these into one report - don't answer with three separate replies:

1. **Tasks** - `list_tasks` (no personId) for everything due today or overdue. These are commitments already made; they lead the debrief.
2. **Priority leads** - `get_priority_leads` (with `excludeStages` set to skip Closed/Trash/Not Interested - check exact names with `list_pipeline_stages` first). If a lead already carries a `Priority: Hot` or `Priority: Warm` tag from a recent `fub-lead-scoring` pass, lead with those; otherwise judge from the recent notes/calls/texts/emails it returns, the same way `fub-lead-scoring` does.
3. **Missed calls** - `list_calls` (no personId) for the last ~24 hours, filtered to misses the same way `missed-call-followup` does (No Answer, Left Message, or near-zero duration - not calls that clearly connected).

## What this skill does not do

This is a scan, not a responder. If it surfaces a missed call or a lead that's gone quiet long enough to be worth a drafted win-back message, say so in the debrief and point at `missed-call-followup` or `stale-lead-revival` rather than drafting anything inline here - keeps this skill fast, read-only, and safe to run unattended. It never creates, completes, or modifies a task; never tags a lead; never sends anything.

## Output format

One message, in this order: overdue/due-today tasks, then Hot/Warm leads worth a touch (name + one-line reason + suggested action), then missed calls from the last 24h (name + when + who called whom). Keep it as scannable as `fub-lead-scoring`'s output - this replaces opening FUB, not summarizes it in JSON.

Post it via `notify_slack` (see `skills/slack-review-queue`) every time this runs, even when there's nothing to report - say "nothing overdue, no misses, pipeline's calm" plainly rather than staying silent. A debrief that only posts when something's wrong makes a missed run look identical to a quiet day; posting every time makes the absence of a post the actual signal that something's broken.

## Scheduling this

This skill is meant to run on a recurring basis (daily, first thing) without anyone asking for it by hand - pair it with a scheduled Claude task pointed at this repo's Follow Up Boss connector, the same pattern as a native Gmail/Calendar daily debrief, just aimed at FUB instead. If you're setting that up through an API/session that can't yet carry MCP connector grants on a scheduled trigger, use claude.ai's own Scheduled Tasks / Routines UI instead - that surface handles connector permissions directly.
