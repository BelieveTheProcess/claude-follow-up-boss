---
name: social-media-content-batch
description: Generate a batch of 5 Instagram/social posts from a single topic or theme (e.g. first-time buyer mistakes, a neighborhood spotlight, a market shift). Use when the user asks for a batch/week of social content, or names a topic and wants posts built from it.
---

# Social Media Content Batch

Generate five related social posts from one topic/theme, angled toward the agent's actual farm areas so the output reads as local-expert content rather than generic real-estate advice.

## Inputs

1. **Core topic or theme** - ask if not given. Examples: first-time buyer mistakes, a neighborhood spotlight, a market shift, a myth about the buying/selling process.
2. **`BRAND.md`** - read this for voice, reading level, words to avoid, and farm areas. If the topic is generic (e.g. "first-time buyer mistakes"), localize at least some of the five posts to a named farm area rather than keeping everything generic - that's the difference between content and neighborhood-expert positioning.

## Workflow

1. Confirm the topic and, if relevant, which farm area(s) to anchor it in.

2. Draft five posts that don't just restate the same point five ways - vary the angle: e.g. one myth-busting post, one local-data post, one story/anecdote-style post, one quick-tip carousel outline, one direct CTA post (booking a call/consult).

3. For each post, provide:
   - **Caption** (matching `BRAND.md` tone/reading level, ending per its CTA rules where appropriate)
   - **Format note** (single image, carousel, Reel/short-form script beat sheet) - keep this brief, describing structure rather than producing actual video/image assets
   - **Suggested visual** (what the photo/graphic/clip should show) - describe it, don't fabricate a claim about a specific property unless the user provided one

4. Do not invent specific statistics, prices, or property details - if the post wants a stat (e.g. "days on market down 12%"), either use a number the user supplied or write it as a placeholder like `[insert current DOM stat]` rather than making one up.

5. **Review queue (optional).** If `notify_slack` is configured, offer to post the batch to a review channel (e.g. `marketing-review`) instead of assuming it should go straight to a scheduler.

Return the five posts as a numbered list, not a wall of text - this should be easy to skim and copy individually into a scheduler.
