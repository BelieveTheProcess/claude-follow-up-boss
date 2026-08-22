---
name: weekly-market-update
description: Draft a weekly market update email - a general one for the full client list, and a localized version for specific farm areas/buildings the agent farms. Use when the user asks for a market update, market report, or weekly newsletter draft.
---

# Weekly Market Update

Draft two flavors of a recurring market update, per the video this skill is based on: one general update for the whole client base, and separate localized updates for each farm area/building in `BRAND.md`, since a generic "the market is shifting" email is far weaker than one specific to a building or neighborhood someone actually cares about.

This repo has no email-sending tool - this skill produces the draft and (optionally) routes it to Slack for review via `notify_slack`; the user still sends it through their own ESP/CRM email tool.

## Workflow

1. **Read `BRAND.md`** for voice/tone and the list of farm areas/neighborhoods/buildings.

2. **Confirm the data source.** Ask the user for (or use what they paste in) this week's market figures: new listings, price changes, closed sales, days-on-market, inventory trends - for the general update, and for each farm area, the same figures scoped to that specific area/building if available. Do not fabricate statistics - if a number isn't provided, either ask for it or clearly mark the section as qualitative ("inventory feels tighter this week") instead of inventing a figure.

3. **Draft the general update**: one email for the full list. Structure: a one-line hook on the most notable market movement, 3-5 short bullet-style takeaways, then a soft CTA (per `BRAND.md`) inviting a reply/call for anyone with specific questions.

4. **Draft one localized update per farm area** named in `BRAND.md` (or the ones the user specifies for this run). Each should feel written for that specific community, not a copy-paste with the name swapped - reference what's actually distinctive about that area's activity this week.

5. **Segment recipients (optional).** If the user wants to know who each update should go to, use `list_leads` filtered by relevant tags/stage to pull the audience for the general update, and by farm-area tags (if the user tags leads that way, e.g. `"Golden Beach"`) for each localized version.

6. **Route for review.** If `notify_slack` is configured, post each draft to the review channel (e.g. `marketing-review`) rather than assuming it's ready to send - flag it clearly as a draft awaiting approval.

7. **Hand back plain drafts** (subject line + body) the user can paste into their email tool, clearly labeled by audience (General / <Farm Area Name>).

8. **Offer a shareable one-pager, optionally.** If the user also wants a version to post/print (not just email), and Claude's built-in `pptx` skill is available in this session, offer to turn the general update (or one farm-area version) into a short slide/one-pager - a market snapshot graphic reads very differently on social than an email. This is a separate, optional step; the email drafts from step 7 are the primary deliverable.
