# Copy-and-paste pages for GoDaddy Website Builder

Each `.html` file here is one complete page, with its styles and form script included. You paste the whole file into a GoDaddy **HTML** section.

| File | GoDaddy page | Page URL to set |
| --- | --- | --- |
| `home.html` | Home | (home page) |
| `sell-my-house-fast-san-jose.html` | Sell My House Fast San Jose | `sell-my-house-fast-san-jose` |

To regenerate these after changes: `node build.mjs && node export-godaddy.mjs` in the `website/` folder.

## Paste a page into GoDaddy

1. Open one of the files above, select everything (Ctrl+A / Cmd+A) and copy it.
2. Sign in to GoDaddy, go to **My Products**, find your website, and click **Edit Website**.
3. Open the page, e.g. **Home**. Delete the old sections you're replacing: click a section, then the trash icon.
4. Click **Add Section**, search for **HTML**, and add it.
5. Click into the HTML section's **Custom Code** box, paste, and click **Done**.
6. Click **Publish**.

For the San Jose page, first go to **Website → Site Navigation → + → Page**. Name it "Sell My House Fast San Jose". In the page's settings, set the page URL to `sell-my-house-fast-san-jose`. Then do steps 4 to 6.

## Set each page's Google title and description

GoDaddy ignores the title and description inside pasted code, so enter them in the page's settings under **SEO**:

- **Home**
  - Title: `Sell Your Bay Area House As-Is | Believe The Process Ventures`
  - Description: `Get a fair cash offer on your Bay Area house. No repairs, no showings, no commissions on a direct sale. Close on your timeline.`
- **San Jose**
  - Title: `Sell My House Fast San Jose, CA | We Buy Houses for Cash`
  - Description: `Need to sell your house fast in San Jose? We buy San Jose houses for cash, as-is, from Willow Glen to Evergreen. No commissions, no showings. Offer within 24 hours of seeing it. (415) 770-0722.`

## Connecting the form

In each pasted page, search the code for `const FORM_ENDPOINT = "";` and put your Zapier Catch Hook URL between the quotes. Do this on every page, because each pasted page has its own copy. Until then, the form tells visitors to call (415) 770-0722.

## What to expect with GoDaddy (limits of the HTML section)

- **Two headers:** GoDaddy keeps its own header and footer around your code. In **Theme** settings, choose the most minimal header you can, and remove the old menu items.
- **Frame limits:** the code runs inside a frame. The top bar won't stay pinned while scrolling. The phone "Call / Get my offer" bar may sit at the bottom of the frame instead of the screen. If GoDaddy shows an inner scrollbar, drag the section taller in the editor.
- **Weaker for Google:** content inside a frame counts less for search rankings than a real page. The SEO work from this project (page titles, business schema, sitemap, clean city URLs) only fully works on the Netlify setup.
- **Missing pages:** links to pages that haven't been added in GoDaddy yet, like other cities and About, go to a "page not found" screen until those pages exist.

These pages work on GoDaddy as a stopgap. For the full version, deploy to Netlify and point the domain there: see "Deploying to Netlify" in `../README.md`. You keep the domain at GoDaddy either way.
