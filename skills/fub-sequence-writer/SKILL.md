---
name: fub-sequence-writer
description: Draft a personalized Follow Up Boss follow-up sequence (email/text copy) for a specific lead type, source, or situation, using the agent's own video/content library instead of generic drip copy. Use when the user asks to write, spin up, or personalize a follow-up sequence, drip campaign, or Action Plan.
---

# Follow Up Boss Sequence Writer

Generic FUB drips read like "just checking in, still looking?" This skill drafts sequence copy in the agent's own voice, referencing their real content (YouTube videos, past emails, guides) so each sequence is specific to who the lead is and where they came from - source (Facebook, YouTube, ChatGPT ads, referral), lead type (buyer, seller, first-time buyer, downsizer, relocating), and intent.

## Important constraint: what the FUB API can and can't do

- `list_action_plans` - lists existing Action Plans (sequences) already built in FUB, with id/name/status.
- `apply_action_plan` - enrolls a specific person in an existing plan by id.
- `create_lead_event` - if an Action Plan is mapped to a Lead Source under Admin > Lead Flow, sending a lead through this (instead of `add_lead`) with a matching `source` auto-enrolls them at creation time - useful when this skill's segment (e.g. "Facebook Lead - Downsizing") corresponds to a real configured source rather than a plan you'd enroll people in manually after the fact.
- There is **no API to create or edit an Action Plan's steps** (subject lines, email bodies, text copy, wait times). That has to be built in the FUB UI under Automations.

So this skill's job is to **draft the content**, not to programmatically build the plan. Always tell the user clearly: "here's the sequence copy - paste these steps into a new/existing Action Plan in FUB" rather than implying it was created automatically. If they want the lead enrolled in an *existing* plan while a new one is being built, offer `apply_action_plan` as a separate action.

## Workflow

1. **Establish the segment.** Ask or infer: lead source (Facebook, YouTube, ChatGPT ads, referral, open house, etc.), lead type (buyer/seller/first-time buyer/downsizer/relocating/investor), and any specifics (e.g. "downsizing clients in Austin").

2. **Check what already exists.** Call `list_action_plans` so the draft can either extend/complement an existing plan or clearly be positioned as a new one, and so you don't propose duplicating something that already exists.

3. **Match cadence to source urgency.** Different sources warrant different pacing - use judgment, but as a default:
   - Paid/inbound leads (Facebook, ads, website forms): first touch within minutes, then frequent (daily-ish) touches for the first week, tapering off.
   - Warm/organic leads (YouTube, referral, past client): slower, higher-trust cadence - a few touches a week, more content-driven than sales-driven.

4. **Pull from the agent's content library.** When the user has YouTube videos, guides, or past content relevant to the segment (e.g. a first-time-buyer-from-California video for a relocating buyer, a home-valuation explainer for a seller), reference and link the *specific* piece of content in the relevant step rather than generic "here's some info." If you don't know the agent's actual video library, ask for it (titles + what each one covers + links) rather than inventing content that doesn't exist.

5. **Draft each step as:** day offset (e.g. "Day 0", "Day 3"), channel (text or email), subject line (for email), and the message body in the agent's voice - warm, direct, not corporate. Each step should have a clear purpose (build trust, answer an objection, invite a call) - don't pad the sequence with filler touches.

6. **Deliver as a copy-pasteable draft**, e.g.:

```
Sequence: Facebook Lead - Downsizing (Austin)

Day 0 (text): Hey {firstName}, thanks for reaching out about downsizing options in Austin! ...
Day 0 (email) - Subject: "A few Austin downsizing options for you"
  Body: ...includes link to [video: "Downsizing in Austin: What to Expect"]...
Day 2 (text): ...
Day 5 (email) - Subject: ...
...
```

7. **If the user wants a lead enrolled now** while the plan is still being built manually in FUB, use `list_action_plans` to find the closest existing match and `apply_action_plan` to enroll them, and say so explicitly - don't silently substitute a different plan than what was asked for.
