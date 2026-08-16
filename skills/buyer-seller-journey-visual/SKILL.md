---
name: buyer-seller-journey-visual
description: Build a branded, interactive step-by-step visual of the home buying or selling process, for screen-sharing during a buyer/seller consult or embedding in a listing presentation. Use when the user asks for a process visual, journey map, transaction timeline, or something more visual than a text explanation to show a client how the process works.
---

# Buyer / Seller Journey Visual

A text explanation of "here's how buying a house works" is forgettable in a consult; a clickable, branded step-by-step visual the agent can screen-share is not. This skill builds that as an interactive artifact rather than a static document.

## Before building anything

Read `BRAND.md` for voice, brand colors, and farm-area details - this only reads as a step above a generic template if it actually looks like the agent's brand, not a default theme.

## Workflow

1. **Confirm buyer or seller** (don't assume), and roughly how many milestones to show. Default to 5-7:
   - Buyer: First Conversation -> Pre-Approval -> Home Search -> Offer -> Under Contract -> Closing.
   - Seller: First Conversation -> Pricing & Prep -> Listing Launch -> Showings & Offers -> Under Contract -> Closing.
   Adjust to match what the agent actually says in `BRAND.md` or in the request - these are starting points, not a fixed script.
2. **Build it as an interactive artifact** - clickable or step-through, not a static image or slide. The point is something the agent navigates live while talking, not a screenshot. Keep the copy per step to a sentence or two, since this is a visual aid spoken over, not a document read silently.
3. **Use the agent's actual brand colors and tone from `BRAND.md`**, not a generic palette - that's the difference between something that reads as custom and something that reads as a template everyone else also has.
4. **Offer a static leave-behind separately.** A PDF/one-pager export is a reasonable follow-up once the interactive version is approved, but don't produce both by default - the interactive version is the primary deliverable.

## What this doesn't do

This is a presentation asset, not a data tool - it never reads from or writes to Follow Up Boss. Personalizing it per client (their name, their specific timeline) is a manual customization each time, not something this skill automates.

## Output

The interactive artifact itself, plus a one-line description of what's in it so the agent can confirm it matches what they pictured before using it live in a consult.
