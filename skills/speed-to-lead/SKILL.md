---
name: speed-to-lead
description: Set up and explain the automatic speed-to-lead system - every new Follow Up Boss lead instantly gets a call-back task and a Slack alert, with an optional (off by default) auto first-touch text. Use when the user asks about speed-to-lead, responding to new leads faster, or how the webhook/auto-response system works.
---

# Speed-to-Lead

Response time is one of the single biggest levers on lead conversion in real estate - a lead contacted within minutes converts far better than one contacted an hour later. Every other skill in this repo is pull-based (you ask, Claude checks FUB). This one is push-based: the moment a new lead lands in Follow Up Boss, this server reacts on its own, without anyone opening a chat.

## What happens automatically, once set up

On every new lead (`peopleCreated` event):

1. **An urgent FUB task is created** - "Call new lead within 5 minutes: `<name>`", due immediately, so it surfaces in FUB's own task list/notifications even if nobody's watching Slack.
2. **A Slack alert fires** to the channel labeled `speed-to-lead` in `SLACK_WEBHOOKS` (see `skills/slack-review-queue`), with the lead's name, source, phone, and a direct FUB link.
3. **Optionally, an automatic first-touch SMS** - see the compliance note below. **Off by default.**

## Setup

1. Deploy this server somewhere with a public HTTPS URL (see "Deploying to Railway" in the README) - FUB webhooks require `https://`.
2. Make sure a `speed-to-lead` entry exists in your `SLACK_WEBHOOKS` JSON (or set `SPEED_TO_LEAD_SLACK_CHANNEL` to point at a different label you've configured).
3. Register the webhook by asking Claude to call `register_fub_webhook` with `callbackUrl: "https://<your-deployed-url>/webhooks/fub"`. This only needs to be done once.
4. That's it - no separate webhook secret to generate. Signature verification reuses your existing `FUB_SYSTEM_KEY`.

## Important: the auto-text option is a compliance decision, not just a technical one

Setting `AUTO_FIRST_TOUCH_SMS=true` makes this server text every new lead automatically, with zero human review, the moment they're created. Before turning this on:

- **TCPA / consent**: automated text messages to a phone number generally require that the person has given prior express consent to be texted (this varies by how/where the lead was captured - a lead-gen form with texting consent language is different from, say, a number typed into a spreadsheet from a business card). Confirm your lead sources actually establish this consent before enabling auto-send. This is a legal question worth checking with your broker/compliance counsel, not something to assume from this doc.
- **Message content**: `FIRST_TOUCH_SMS_TEMPLATE` (with `{firstName}` / `{agentName}` placeholders) is sent verbatim with no review step - keep it generic and low-commitment (e.g. "thanks for reaching out, I'll call you shortly") rather than anything that could misrepresent the property/deal.
- **The safe default** is to leave `AUTO_FIRST_TOUCH_SMS` unset (or `false`) and let the FUB task + Slack alert be the trigger for a human to send the actual first text/call within minutes. That alone captures most of the speed benefit without the compliance exposure of a fully automated message.

## Extending this

Right now the webhook handler (`src/webhooks.js`) only reacts to `peopleCreated`. The same pattern (verify signature, ack fast, process after) can be extended to other events FUB supports - e.g. `peopleStageUpdated` to trigger a different task/message when someone moves stages, or `callCreated` to feed `missed-call-followup` in near-real-time instead of on demand. Ask for that specifically if you want it built.
