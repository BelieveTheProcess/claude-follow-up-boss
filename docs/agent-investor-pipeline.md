# Agent-to-Investor AI Pipeline: How It Works

Notes on the "AI agents" architecture Carlos Martinez posted in the Real Estate: Agent
Investors Skool community (skool.com/agentinvestors), and how it maps onto this repo.

> The post shows the diagram only, with no write-up. The node names are Carlos's. What each
> node does is **inferred** from its name, the arrows, and the Agent-to-Investor model:
> find off-market-style deals on the MLS and send offers to listing agents, with no paid
> marketing.

## The diagram, by stage

```
                     Daily Routine  (orchestrator / cron)
        ┌──────────────┬──────┴──────┬──────────────┬───────────────┐
        ▼              ▼             ▼              ▼               ▼
  Redfin Downloader → CSV Dedup   Gold Miner   Probate Researcher   (also calls Offer Sender
        │              │             │              ▲                 + Pipeline Monitor directly)
        │              │             │              ┆ Firecrawl (scraper, dashed = data source)
        │              ▼             ▼              ┆        ┆
        └──────────► ARV Engine ◄────────────────── ┘      Rerun Engine ──► ARV Engine
                          │
                          ▼
                      QA Agent
                  ┌───────┴────────┐
                  ▼                ▼
            Offer Sender    Offer Sender Review (human-in-the-loop)
                  └───────┬────────┘
                          ▼
                   Pipeline Monitor
                          ▼
                    GHL Messenger
```

| # | Node | What it most likely does | Inputs → Outputs |
|---|------|--------------------------|------------------|
| 0 | **Daily Routine** | Scheduler that runs the whole chain once a day. It kicks off every sourcing agent, the Offer Sender, and the Pipeline Monitor. | cron → triggers |
| 1 | **Redfin Downloader** | Downloads CSV exports from saved Redfin searches (e.g. long days on market, price drops, "as-is", specific zips). | saved searches → raw CSV |
| 2 | **CSV Dedup** | Drops listings already seen or already offered on, so nothing gets offered on twice. | raw CSV + history → new-only rows |
| 3 | **Gold Miner** | Mines listing remarks for motivation keywords ("cash only", "TLC", "investor special", "estate sale", "needs work", "bring all offers") and scores them. | listings → flagged "gold" leads |
| 4 | **Firecrawl** | Web-scraping service ([firecrawl.dev](https://firecrawl.dev)). Dashed lines mean it's a tool other agents use, not a pipeline step. | URLs → clean page text |
| 5 | **Probate Researcher** | Uses Firecrawl on county probate/court records to find estate properties and personal representatives. | probate filings → property + PR contact |
| 6 | **ARV Engine** | Pulls comps, estimates after-repair value and rehab, then computes the max offer (e.g. ARV × 70% − repairs). This is the hub everything feeds into. | property → ARV, repair est., MAO |
| 7 | **Rerun Engine** | Re-checks older deals (price drops, back on market, relisted) with Firecrawl and sends changed ones back through the ARV Engine. | old deals → refreshed deals |
| 8 | **QA Agent** | Sanity-checks the numbers: bad comps, ARV outliers, missing data, offers too far below list. Clean deals go to the sender. Doubtful ones go to review. | priced deals → pass / needs-review |
| 9 | **Offer Sender** | Sends the offer to the listing agent automatically (email, text, or LOI PDF). | approved deal → offer sent |
| 10 | **Offer Sender Review** | Human-approval queue for deals the QA Agent flagged. | flagged deal → approve/edit/kill |
| 11 | **Pipeline Monitor** | Tracks each offer's status (sent, replied, countered, accepted, dead) and decides who needs follow-up. | offers + replies → follow-up list |
| 12 | **GHL Messenger** | Sends the follow-up texts and emails through GoHighLevel, their CRM. | follow-up list → messages |

### Design ideas worth copying

1. **One orchestrator, many narrow agents.** Each agent does one job and hands off a file or
   rows. Any single step can be rerun on its own.
2. **Every source feeds one ARV Engine.** Deals are priced the same way no matter where they came from.
3. **Dedup before spending money.** Skipping known listings before comps/API calls saves credits.
4. **QA gate plus a human-review lane.** Clean deals go out automatically. Edge cases go to a person.
5. **Rerun loop.** Old deals are re-checked because a price drop can make them work.
6. **Monitor → messenger split.** Deciding who to follow up with is separate from sending the message.

## Mapping it onto this stack (Follow Up Boss + Claude)

| Carlos's node | Our equivalent | Status |
|---|---|---|
| Daily Routine | Claude Code Routine (scheduled trigger), or a cron on Railway | To build |
| Redfin Downloader | Redfin saved-search CSV export, or DealMachine `property_search` / `property_export` | To build (DealMachine connector exists) |
| CSV Dedup | Check address/APN against FUB (`search_leads`) + a "seen" list | To build |
| Gold Miner | Claude skill: keyword and motivation scoring on remarks (see `skills/fub-lead-scoring`, `skills/distressed-seller-outreach`) | Partially built |
| Firecrawl | Firecrawl API or Crustdata `web_fetch` | To add |
| Probate Researcher | County probate scrape + DealMachine skip trace for the personal representative | To build |
| ARV Engine | `housecanary-sidecar/` (valuations, comps) + DealMachine `comps` | Data tools exist, need the MAO formula |
| Rerun Engine | Scheduled re-query of FUB leads in an "Offer Sent / No Response" stage | To build |
| QA Agent | Claude skill with hard rules (ARV spread, comp count, max % under list) | To build |
| Offer Sender | `send_email` (CAN-SPAM compliant) / `send_text` to the listing agent, logged in FUB | Tools exist |
| Offer Sender Review | `notify_slack` → `skills/slack-review-queue` | Built |
| Pipeline Monitor | `get_priority_leads`, `list_tasks`, FUB pipeline stages | Built |
| GHL Messenger | FUB Action Plans (`apply_action_plan`) + `send_text` / `send_email` | Built |

**Bottom line:** the back half (review queue, sending, monitoring, messaging) already exists
in this repo. The missing pieces are the **front half**: sourcing (Redfin/DealMachine pull,
dedup, Gold Miner, probate), a real **ARV/MAO engine** on top of the HouseCanary sidecar,
and the **QA gate**.

## Suggested build order

1. **ARV Engine skill.** Takes an address, pulls comps (HouseCanary/DealMachine), outputs ARV, repairs, and MAO.
2. **QA Agent rules.** Written into the same skill or a separate one. Fails send to Slack review.
3. **Sourcing.** A DealMachine or Redfin pull filtered by DOM/price-drop/keywords, then dedup against FUB.
4. **Offer Sender.** A templated email/LOI to the listing agent through `send_email`, creating the FUB lead with the stage "Offer Sent".
5. **Daily Routine.** One scheduled Claude run that chains 3 → 1 → 2 → 4 and then posts a summary to Slack.
6. Add later: Probate Researcher, Rerun Engine.
