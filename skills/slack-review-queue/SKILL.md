---
name: slack-review-queue
description: Set up and use a multi-channel Slack review queue - separate channels for marketing review, a "CMO" metrics digest, and content briefing - so AI-drafted output gets a human check before it goes anywhere. Use when the user wants to route drafts/reports to Slack, or asks how to set up the Slack side of their AI workflow.
---

# Slack Review Queue

The video this is based on describes running several "agents" that each report into their own Slack channel - a CMO agent tracking metrics, a content-briefing agent, a marketing-review channel for drafts before they go out. This repo implements the actual delivery mechanism (the `notify_slack` tool, via Slack Incoming Webhooks) and this skill documents how to wire it up and use it. It does not implement the metrics-gathering or content-briefing logic itself - those are separate skills/prompts you write once the pipe exists.

## What's actually implemented here

- `notify_slack` (in `src/tools/index.js`) posts a text message to one Slack channel, selected by a label you choose (e.g. `"marketing-review"`).
- Channels are configured via the `SLACK_WEBHOOKS` environment variable - a JSON object mapping your chosen label to a Slack Incoming Webhook URL for that channel.
- There's no polling/reading from Slack - this is one-way (Claude -> Slack). Reading replies back would need the Slack Web API with a bot token and event subscriptions, which isn't set up in this repo.

## Setup

1. In Slack, go to **Apps -> Incoming Webhooks** (or create a minimal Slack app with the Incoming Webhooks feature enabled) for your workspace.
2. Create one webhook per channel you want to route to, e.g.:
   - `#marketing-review` - drafts awaiting approval (market updates, social batches, open-house follow-ups)
   - `#cmo-digest` - periodic metrics summaries, if/when you build something that gathers them
   - `#content-briefing` - content ideas/briefs for the team
3. Each webhook creation gives you a URL like `https://hooks.slack.com/services/T000/B000/XXXX`.
4. Set `SLACK_WEBHOOKS` in your `.env` (or Railway variables) to a JSON object mapping your own labels to those URLs:

```
SLACK_WEBHOOKS={"marketing-review":"https://hooks.slack.com/services/...","cmo-digest":"https://hooks.slack.com/services/...","content-briefing":"https://hooks.slack.com/services/..."}
```

5. Any skill (or direct request) can now call `notify_slack` with `channel: "marketing-review"` and the drafted text.

## How other skills use this

`openhouse-followup`, `weekly-market-update`, and `social-media-content-batch` all mention posting their drafts to a review channel via `notify_slack` before anything is considered "sent." Treat that as the default - don't skip the review step unless the user explicitly says a particular piece of content doesn't need one.

## What this does not do (be upfront about this)

- It does not build a "CMO agent" that tracks ad spend, cost-per-lead, or posting cadence - that would need read access to your ad platforms and social accounts, none of which are connected here.
- It does not automatically tag/notify specific teammates - Incoming Webhooks post as a generic bot to a channel; `@mentioning` a specific person reliably requires the Slack Web API with real user IDs, not just this webhook.
- If you want either of those, say so specifically and they can be scoped as their own tools once the right credentials/API access exist.
