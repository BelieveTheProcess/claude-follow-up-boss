// Makes copy-and-paste versions of each page for GoDaddy.
//
//   node build.mjs && node export-godaddy.mjs   -> writes ./godaddy/*.html
//
// Each file is one self-contained page: the CSS and JS are inlined, links point
// to https://believetheprocess.com, and links open in the full browser window
// (GoDaddy Website Builder shows custom HTML inside a frame).

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SITE_URL = "https://believetheprocess.com";
const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
const out = join(root, "godaddy");

const css = readFileSync(join(dist, "assets/css/site.css"), "utf8");
const js = readFileSync(join(dist, "assets/js/site.js"), "utf8");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".html") ? [p] : [];
  });
}

mkdirSync(out, { recursive: true });
// Replace old page files but keep README.md.
for (const f of readdirSync(out)) if (f.endsWith(".html")) rmSync(join(out, f));

for (const file of walk(dist)) {
  const rel = relative(dist, file).split(sep).join("/");
  if (rel === "404.html") continue;
  const name = rel === "index.html" ? "home.html" : rel.replace(/\/index\.html$/, "") + ".html";

  let html = readFileSync(file, "utf8")
    .replace('<link rel="stylesheet" href="/assets/css/site.css">', `<style>\n${css}\n</style>`)
    .replace('<script src="/assets/js/site.js" defer></script>\n', "")
    .replace("</body>", `<script>\n${js}\n</script>\n</body>`)
    // Root-relative links and assets -> full URLs on the live domain.
    .replace(/(href|src)="\/(?!\/)/g, `$1="${SITE_URL}/`)
    // Every link except in-page #anchors opens in the whole window, not inside GoDaddy's frame.
    .replace(/<a (?![^>]*href="#)([^>]*href=")/g, '<a target="_top" $1');

  // The script rewrites "Get my offer" links on pages without a form; point those at the live site too.
  html = html.replace('link.setAttribute("href", "/contact-us/")', `link.setAttribute("href", "${SITE_URL}/contact-us/")`);

  writeFileSync(join(out, name), html);
  console.log(`godaddy/${name}  (${Math.round(html.length / 1024)} KB)`);
}
