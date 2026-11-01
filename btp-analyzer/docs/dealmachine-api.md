# DealMachine API notes (for the comps provider)

## Where this came from

- Base URL, auth, and endpoints come from DealMachine's official CLI source: https://github.com/DealMachine/dealmachine-cli (files `src/lib/client.ts`, `src/commands/comps.ts`, `src/commands/enrich.ts`).
- Docs: https://api.docs.dealmachine.com
- Create an API key: https://dealmachine.com/settings/developer (workspace admin, active subscription). Keys start with `dm_sk_live_` and are shown once.
- Response shapes below were observed from DealMachine's MCP connector in a live test, not from the REST API directly. They should match (the CLI types agree), but verify with one real call.

## Auth and limits

- Base URL: `https://api.v2.dealmachine.com/v1`
- Header: `Authorization: Bearer dm_sk_live_...` and `Content-Type: application/json`
- Rate limits (per workspace, from the quickstart): 60 requests per minute, 5,000 per day.
- Credits: a matched property costs 1 property credit. Repeat comps calls for the same property were deduplicated (0 extra credits) in testing. Responses include a `credits` object.

## 1. Match an address

`POST /enrichment/address`

Request (property data only, no contact/people credits):
```json
{ "data": [{ "full_address": "123 Main St, San Jose, CA 95125" }], "contact_audience": "none" }
```
A ZIP code is required. Without it the row comes back unmatched with `match_failure.reason` explaining.

Matched row fields used by the app (observed):
```
matched (bool), dm_property_id, full_address, address, latitude, longitude,
living_area_sqft, num_bedrooms, num_bathrooms, year_built, estimated_value
```
Unmatched row: `{ matched: false, match_failure: { code, reason } }`.

## 2. Get comps

`POST /comps`

Request used by the prototype for a first pull (sold only, widest standard window, 25 results):
```json
{
  "property_ids": ["prop_123"],
  "location": { "type": "radius", "latitude": 37.0, "longitude": -122.0, "radius_miles": 1 },
  "criteria": {
    "include_active_listings": false,
    "include_pending": false,
    "limit": 25,
    "sort_by": "match",
    "sqft_tolerance_percent": 30,
    "timeframe": "12months"
  }
}
```
`timeframe` is one of `3months`, `6months`, `12months`, `all`. `radius_miles` is 0.1 to 25. The CLI sends `location` with only `type` and `radius_miles`, so latitude and longitude may be optional; verify.

The "Search wider" button in the prototype re-runs with `radius_miles: 2` and `timeframe: "all"`.

Response (observed):
```json
{
  "data": [{
    "dm_property_id": "prop_123",
    "found": true,
    "subject": { "address": "...", "bedrooms": 3, "bathrooms": 4, "sqft": 1922, "year_built": 2019, "estimated_value": 1073000 },
    "comps": [{
      "type": "sale",
      "display_line_1": "24170 Amaranth Loop",
      "display_line_2": "Hayward, CA, 94541",
      "bedrooms": 3, "bathrooms": 4, "sqft": 1922, "year_built": 2020,
      "distance": 0.09,
      "sale_price": 1150000,
      "sale_date": "2026-04-03T00:00:00.000Z",
      "price_per_sqft": 598,
      "match_score": { "overall": 88, "location": 94, "size": 100, "recency": 0 }
    }],
    "summary": { "count": 2, "median_price": 1080000, "confidence_level": "low" },
    "value_estimation": { "estimated_value": 1058061, "confidence_interval": { "low": 966766, "high": 1149356 } },
    "total_comps_found": 2
  }],
  "credits": { "used": 0, "properties": 1, "deduplicated": 1 }
}
```

## How the app uses it

1. Match the address, then keep `dm_property_id`, latitude, longitude, and the subject details (fills beds, baths, sq ft if blank).
2. Pull comps once at 1 mile and 12 months. The page then applies Adan's window rule client-side using each comp's `distance` and `sale_date`: try 0.25, 0.5, 0.75, 1 mile within 90, 180, 270, 365 days and use the first window with at least 3 comps; rank by closeness in sq ft; show the 3 closest; compute the range from up to 6.
3. If fewer than 3 fit, offer "Search wider" (2 miles, all sales).
4. The comps provider should return the same shape no matter the source so an MLS feed can replace it later.

## Test result worth knowing

On a newer subdivision in Hayward (ZIP 94541), only 2 sold comps existed within 1 mile and 12 months. Thin data is normal for new construction and condos. The UI must handle 0, 1, or 2 comps and say so plainly.

## Open question for Adan

Confirm with DealMachine (support@dealmachine.com) that his plan allows showing their comps data to clients inside his own app. Their site lists "apps powered by DealMachine" under Enterprise and API licensing.
