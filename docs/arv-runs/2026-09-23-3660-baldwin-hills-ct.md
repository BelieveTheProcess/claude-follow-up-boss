# ARV run: 3660 Baldwin Hills Ct, South San Francisco, CA 94080

First live test of `skills/arv-engine`, 2026-09-23. Data comes from DealMachine (1 property credit).
Nothing was written to Follow Up Boss or Slack.

## Subject
4bd / 2ba · 1,770 sqft · built 1970 · lot 2,450 sqft · SFR (small-lot Westborough tract) · APN 091-380-110
**Not listed**: owner-occupied, bought 1998 for $258k, loan balance about $29k, **98% equity**.
DealMachine AVM (as-is): **$1,198,000**.

## Comps (0.5 mi, sold Apr–Jun 2026, same type)

| Comp | Sold | $/sqft | vs median | Grid-adjusted to subject | Used? |
|---|---|---|---|---|---|
| 3979 Geddes Ct (4/3, 1,790) | $1,445,000 · 06/2026 | $807 | +1% | $1,429,500 | ✅ ARV |
| 3731 Bettman Way (3/2, 1,680) | $1,370,000 · 05/2026 | $815 | +2% | $1,413,500 | ✅ ARV |
| 3764 Myrna Ln (3/3, 1,540) | $1,375,000 · 05/2026 | $893 | +11% | $1,467,000 | ✅ ARV |
| 3730 Bettman Way (3/2, 1,500) | $1,355,000 · 05/2026 | $903 | +13% | $1,470,500 | ✅ ARV |
| 2405 Liberty Ct (3/2, 1,610) | $1,280,000 · 05/2026 | $795 | −1% | $1,351,500 | ➖ below-median $/sqft, not counted as renovated |
| 3619 Bettman Way (3/2, 1,680) | $1,210,000 · 05/2026 | $720 | −10% | $1,253,500 | ➖ likely unrenovated (as-is reference) |
| 3734 Myrna Ln (4/2, 1,810) | $1,238,000 · 04/2026 | $684 | −15% | $1,222,000 | ➖ likely unrenovated (as-is reference) |
| 3907 Reston Ct (4/2, 1,820) | $1,000,000 · 04/2026 | $549 | −31% | $980,000 | ❌ outlier (0 DOM, probably off-market or distressed) |

Grid adjustments: $400/sqft marginal (about 50% of the $801 median), ±$7,500 per bed/bath.
There are no remarks or photos, so a comp counts as "renovated" when its $/sqft is at or above the median.

## Result

```
Assumptions: 70% rule · Medium rehab (condition unknown) · 0.5 mi / 6 mo

ARV              $1,448,000   (range $1.41M–$1.47M, 4 comps)
Rehab            $70,800      (Medium $40/sqft default)
                 $159,300     (Bay Area realistic, ~$90/sqft)
MAO @70%         $942,800     (default rehab)  |  $854,300 (Bay Area rehab)
MAO @80%         $1,087,600   |  $999,100
vs as-is AVM     79% of $1.198M (default rehab)
Confidence       C — condition unknown; "renovated" inferred from $/sqft only
Verdict          🟡 REVIEW
```

**QA rules that fired:** grade C; ARV is 21% above the as-is AVM (expected when a dated home gets renovated, but the rule still flags it); no list price to measure the offer against.

## Takeaways
- At 70% the MAO ($855–943k) sits below the unrenovated sales ($1.21–1.24M). A 98%-equity owner is very unlikely to accept that, because listing gets them more. Bay Area flips usually need an 80–85% rule.
- This isn't an MLS listing, so it doesn't fit the agent-to-investor Offer Sender flow. It would be a direct-to-owner lead instead.
- Skill fixes this run prompted: (1) replace the "$/sqft × subject sqft" scaling with grid adjustments, since it overstated ARV by about $150k from the smaller comps; (2) add a high-cost-market rehab override; (3) add off-market handling.
