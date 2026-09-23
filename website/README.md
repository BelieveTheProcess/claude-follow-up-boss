# believetheprocess.com website

This is the cash home-buyer website for Believe The Process Ventures LLC. It's plain HTML, CSS and JS with no framework. A small build script (`build.mjs`, no dependencies) adds the shared header, footer, offer form and SEO tags to every page.

The design comes from `design/believetheprocess-home.html`. It's saved here with only the site-rule fixes applied: agent and listing wording removed, and the personal Instagram replaced with the business email. The first part of `public/assets/css/site.css` is that file's CSS, copied as-is. Styles added for the other pages are at the bottom, marked "Additions", and use the same colors and fonts.

```
website/
  build.mjs                 builds src/ + public/ into dist/ (this is what Netlify runs)
  src/partials/             shared pieces used on every page
    layout.html             <head>, SEO tags, schema, page shell
    header.html  footer.html
    offer-form.html         the one reusable offer form
    trust-strip.html  roofline.html  check.html
  src/pages/                one folder per page = one clean URL
    index.html                              ->  /
    sell-my-house-fast-san-jose/index.html  ->  /sell-my-house-fast-san-jose/
    404.html
  public/                   copied as-is: CSS, JS, images, robots.txt
    assets/js/site.js       FORM_ENDPOINT setting is at the very top
  design/                   your original homepage file (reference only, not published)
../netlify.toml             Netlify build settings (at the repo root)
```

To preview locally, run `node build.mjs` and open the files in `dist/`, or run `npx serve dist`.

## Page plan

Status: **built** = ready for review in this round. Everything else is planned for the next round.

| Page | URL | Status |
| --- | --- | --- |
| Home | `/` | built |
| San Jose | `/sell-my-house-fast-san-jose/` | built |
| Santa Clara | `/sell-my-house-fast-santa-clara/` | next |
| Sunnyvale | `/sell-my-house-fast-sunnyvale/` | next |
| Milpitas | `/sell-my-house-fast-milpitas/` | next |
| Mountain View | `/sell-my-house-fast-mountain-view/` | next |
| Campbell | `/sell-my-house-fast-campbell/` | next |
| Morgan Hill | `/sell-my-house-fast-morgan-hill/` | next |
| Gilroy | `/sell-my-house-fast-gilroy/` | next |
| Fremont | `/sell-my-house-fast-fremont/` | next |
| Hayward | `/sell-my-house-fast-hayward/` | next |
| Oakland | `/sell-my-house-fast-oakland/` | next |
| San Francisco | `/sell-my-house-fast-san-francisco/` | next |
| Daly City | `/sell-my-house-fast-daly-city/` | next |
| Concord | `/sell-my-house-fast-concord/` | next |
| Inherited / probate | `/sell-inherited-house-probate/` | next |
| Foreclosure / behind on payments | `/sell-house-facing-foreclosure/` | next |
| House needs repairs | `/sell-house-that-needs-repairs/` | next |
| Divorce | `/sell-house-during-divorce/` | next |
| Tired landlord / problem tenants | `/sell-rental-property-with-tenants/` | next |
| Relocating / downsizing | `/sell-house-relocating-downsizing/` | next |
| Vacant property | `/sell-vacant-house/` | next |
| How It Works | `/how-it-works/` | next |
| About | `/about/` | next |
| FAQ | `/faq/` | next |
| Contact / Get Your Offer | `/contact-us/` (same URL as your current site) | next |
| Privacy Policy | `/privacy-policy/` | next |
| Terms of Service | `/terms-of-service/` | next |

The header and footer already link to every page above, so links to pages marked "next" return the 404 page until those pages are built.

Each page gets its own title and meta description (set in its front matter), a canonical URL, Open Graph tags, and LocalBusiness schema. Any FAQ block marked `data-faq` also becomes FAQPage schema automatically. `sitemap.xml` is generated on every build from the pages that exist, so new pages are added to it automatically.

## Site rules (apply to every page)

- The site represents **Believe The Process Ventures LLC only**, as a direct cash buyer. No realtor credentials, agent or brokerage names, license or DRE numbers, listing services, or personal real estate social accounts.
- Contact: phone **(415) 770-0722**, email **believetheprocess@btpventuresllc.com**.
- No invented reviews, ratings, years in business, media logos or stats.
- Social links: none for now. Add them only for Believe The Process Ventures LLC business pages.

## Before launch: things only you can fill in

- **Reviews:** the homepage has 3 placeholder review cards (look for `REPLACE` in `src/pages/index.html`). Replace them with real reviews used with the seller's permission, or delete the section. The placeholders show no stars, so no rating appears until it's real. Don't launch with the placeholders showing.
- **Your story and photo** go on the About page (next round).

## Connecting the form to Follow Up Boss (Zapier)

Until you do this, submitting the form shows visitors a "please call (415) 770-0722" message with a tap-to-call button, so no lead gets silently lost.

1. In Zapier, create a Zap. For the trigger, choose **Webhooks by Zapier** and then **Catch Hook**. Copy the webhook URL it gives you.
2. Open `public/assets/js/site.js` and paste the URL into the first setting:
   `const FORM_ENDPOINT = "https://hooks.zapier.com/hooks/catch/.../.../";`
   Commit and push. Netlify redeploys automatically.
3. Submit a test lead on the live site, then click **Test trigger** in Zapier. You should see these fields:
   `address, name, phone, email, timeline, situation, consent_text, page_url, page_title, referrer, submitted_at, source`, plus `utm_*`, `gclid` and `fbclid` when the visitor came from an ad.
4. For the action, choose **Follow Up Boss**. If **Create Event** is available, pick it, because events are what trigger Follow Up Boss lead routing and Action Plans. Set the type to *Seller Inquiry* and the source to *believetheprocess.com*. If Create Event isn't listed, use **Create Person**. Map name, email, phone and the property address. Put timeline, situation and page_url into the message or a note.
5. The exact call/text consent wording the lead agreed to arrives in `consent_text`, along with `submitted_at` and `page_url`. Keep those on the lead record as your proof of consent.

## Deploying to Netlify

1. Merge this branch into `main` (or deploy from this branch while you review).
2. Go to [app.netlify.com](https://app.netlify.com) and click **Add new site**, then **Import an existing project**, then **GitHub**. Choose `BelieveTheProcess/claude-follow-up-boss`.
3. Netlify reads `netlify.toml` from the repo root, so the settings fill in on their own: base directory `website`, build command `node build.mjs`, publish directory `dist`. Click **Deploy**.
4. When the build finishes, you get a URL like `something-random.netlify.app`. Open it on your phone and check it. You can rename it under **Site configuration → Change site name**, for example to `believetheprocess.netlify.app`.

Only the `website/` folder is deployed. The Follow Up Boss MCP server in the rest of this repo is untouched.

## Pointing believetheprocess.com (GoDaddy) to Netlify

Do this only after the Netlify site looks right. The GoDaddy site keeps working until the DNS records change.

**A. Add the domain in Netlify**

1. In your Netlify site, go to **Domain management** and click **Add a domain**.
2. Enter `believetheprocess.com` and confirm. Netlify adds `www.believetheprocess.com` too.
3. Netlify asks how you want to manage DNS. Keep DNS at GoDaddy (Netlify calls this "external DNS"). Leave this page open, because it shows the exact values to use.

**B. Change DNS at GoDaddy**

1. Sign in to GoDaddy and go to **My Products**. Next to believetheprocess.com, click **DNS** (or **Manage DNS**).
2. If the records are greyed out or GoDaddy says the domain is connected to Website Builder, first open your Website Builder site settings and disconnect or remove the domain there, then come back.
3. Find the **A** record with name **@**. Edit it: set the value to `75.2.60.5`, and set TTL to 1 hour or the lowest option. If there's more than one A record for @, delete the extras. Delete any **AAAA** records for @.
4. Find the **CNAME** record with name **www**. Edit it to point to your Netlify address, e.g. `believetheprocess.netlify.app` (use whatever Netlify shows you). If there's no www record, add one.
5. **Don't touch** MX, TXT, SPF or DKIM records. Those control email, and changing them can break your email.
6. Save.

**C. Finish in Netlify**

1. Back in **Domain management**, wait for both domains to show as verified. This is often under an hour, but it can take up to 48 hours.
2. Under **HTTPS**, Netlify issues a free SSL certificate on its own once DNS is working. If it doesn't start, click **Verify DNS configuration**, then **Provision certificate**.
3. Set `believetheprocess.com` as the **primary domain**. `www` then redirects to it. The canonical URLs and sitemap already use `https://believetheprocess.com`.
4. Open the site on your phone at `https://believetheprocess.com` and submit a test lead.

**D. After it's live**

- In Google Search Console, add the domain and submit `https://believetheprocess.com/sitemap.xml`.
- Update the website link on your Google Business Profile if needed.
- If your old GoDaddy site had pages that Google indexed, send me their URLs and I'll add redirects so those visitors land on the right new page.
- Cancel the GoDaddy **Website Builder** plan only after the new site is live. Keep the **domain registration** at GoDaddy and keep it on auto-renew.
