---
name: youtube-clip-agent
description: Design/setup guide for a YouTube-clipping content-repurposing pipeline (long-form video to short clips, reported to Slack) - NOT a working integration in this repo. Use when the user asks about the YouTube clipping agent, repurposing video content, or Higsfield from the video, so they understand what's actually buildable today versus what needs external accounts first.
---

# YouTube Clip Agent - Setup Guide (Not Wired Up Yet)

Be upfront with the user: this skill is a design/setup guide, not working code. The video's version of this depends on two external services this repo has no integration for:

1. **Identifying which moments to clip.** "Highest retention" or "highest replay" data is YouTube Studio Analytics, not public video metadata - it requires the YouTube Analytics API with OAuth against the channel owner's account. There's no key/token for this configured here.
2. **Actually cutting the clips.** The video uses Higsfield's clipping product. Higsfield's API/credentials aren't configured in this repo either.

Do not imply either of these is functional until those credentials exist and a real client/tool has been added (mirroring how `src/twilioClient.js` and `src/realGeeksClient.js` were added for the other integrations in this repo).

## What can be done today without those integrations

1. **Manual retention input.** Ask the user to pull their top-performing videos and rough timestamps of high-retention moments directly from YouTube Studio (Analytics -> Engagement -> Audience retention), and paste them in. Claude can work from that without needing API access.

2. **Draft clip briefs.** From a video transcript (the user can paste one, same as how the FUB and this walkthrough video's transcripts were shared in this conversation) plus the flagged timestamps, draft a brief per clip: suggested in/out points, a hook line for the first 2 seconds, a caption, and which platform it's best suited for (Reels/TikTok/Shorts). This is genuinely useful even without automated clipping - it turns "watch the whole video and figure out what to cut" into a checklist someone (the agent, an editor, or Higsfield's manual UI) can execute quickly.

3. **Report to Slack.** Once clips exist (cut manually or through Higsfield's own UI/app, not through this repo), use `notify_slack` (see `skills/slack-review-queue`) to post the clip briefs or finished clip links to a channel for the team, mirroring the "report to Slack" step from the video.

## If the user wants the real integration built

Ask for, specifically:
- A Higsfield API key/docs (or confirmation of what Higsfield's automation API actually supports - clipping-as-a-service vs. manual editor only).
- Whether they're willing to set up YouTube Analytics API OAuth for their channel (Google Cloud project, OAuth consent, refresh token storage), since that's a real setup burden, not a single env var like the FUB/Twilio/Real Geeks integrations.

Only after those are confirmed should new client wrappers and MCP tools be added here, following the pattern of `src/twilioClient.js` / `src/realGeeksClient.js`.
