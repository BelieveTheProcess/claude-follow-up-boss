// Zero-dependency static site build.
//
//   node build.mjs      -> writes the finished site to ./dist
//
// Each page lives at src/pages/<url-path>/index.html and starts with a small
// front-matter block:
//
//   ---
//   title: Page title for Google (unique per page)
//   description: Meta description (unique per page)
//   noindex: true            (optional - keeps the page out of Google + sitemap)
//   ---
//
// Inside a page (or partial), {{> name}} inserts src/partials/name.html.
// Partials can take parameters: {{> offer-form heading="Get your offer"}}
// and read them with {{heading}} or {{heading|default text}}.
//
// Everything in public/ is copied to dist/ as-is (CSS, JS, images, robots.txt).

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, cpSync, rmSync, existsSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Change this one line if the site ever moves to www.believetheprocess.com.
const SITE_URL = "https://believetheprocess.com";

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, "src");
const out = join(root, "dist");

const partialCache = new Map();
function partial(name) {
  if (!partialCache.has(name)) {
    partialCache.set(name, readFileSync(join(src, "partials", `${name}.html`), "utf8"));
  }
  return partialCache.get(name);
}

function parseArgs(str = "") {
  const args = {};
  for (const m of str.matchAll(/(\w[\w-]*)="([^"]*)"/g)) args[m[1]] = m[2];
  return args;
}

function fill(template, vars) {
  return template.replace(/\{\{(?!>)\s*([\w-]+)(?:\|([^}]*))?\s*\}\}/g, (_, key, fallback) =>
    vars[key] !== undefined ? vars[key] : fallback !== undefined ? fallback : ""
  );
}

function render(template, vars, depth = 0) {
  if (depth > 10) throw new Error("Partials nested too deeply (loop?)");
  const withPartials = template.replace(/\{\{>\s*([\w-]+)([^}]*)\}\}/g, (_, name, argStr) =>
    render(partial(name), { ...vars, ...parseArgs(argStr) }, depth + 1)
  );
  return fill(withPartials, vars);
}

function parseFrontMatter(raw, file) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) throw new Error(`${file}: missing front matter`);
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  if (!meta.title || !meta.description) throw new Error(`${file}: needs title and description`);
  return { meta, body: raw.slice(m[0].length) };
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".html") ? [p] : [];
  });
}

const escapeAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const stripTags = (s) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// Any <details class="faq-item" data-faq> blocks on a page become FAQPage schema.
function faqSchema(html) {
  const items = [...html.matchAll(/<details[^>]*data-faq[^>]*>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)];
  if (!items.length) return "";
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(([, q, a]) => ({
      "@type": "Question",
      name: stripTags(q),
      acceptedAnswer: { "@type": "Answer", text: stripTags(a) },
    })),
  };
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

const businessSchema = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "@id": `${SITE_URL}/#business`,
  name: "Believe The Process Ventures LLC",
  url: `${SITE_URL}/`,
  telephone: "+1-415-770-0722",
  description:
    "Local, family-run company that buys houses directly for cash in the San Francisco Bay Area. Sell as-is, no commissions, no showings.",
  image: `${SITE_URL}/assets/img/og-image.png`,
  areaServed: ["Santa Clara County", "Alameda County", "San Mateo County", "San Francisco County", "Contra Costa County"].map(
    (name) => ({ "@type": "AdministrativeArea", name: `${name}, CA` })
  ),
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, "public"), out, { recursive: true });

const pagesDir = join(src, "pages");
const sitemap = [];

for (const file of walk(pagesDir)) {
  const rel = relative(pagesDir, file).split(sep).join("/");
  const urlPath = "/" + rel.replace(/index\.html$/, "");
  const { meta, body } = parseFrontMatter(readFileSync(file, "utf8"), rel);
  const noindex = meta.noindex === "true";
  const canonical = SITE_URL + urlPath;

  const vars = {
    ...meta,
    title: escapeAttr(meta.title),
    description: escapeAttr(meta.description),
    canonical,
    path: urlPath,
    year: String(new Date().getFullYear()),
  };
  const content = render(body, vars);
  const schema =
    `<script type="application/ld+json">${JSON.stringify(businessSchema)}</script>` + faqSchema(content);

  const html = render(partial("layout"), {
    ...vars,
    content,
    schema,
    robots: noindex ? "noindex, follow" : "index, follow",
  });

  const dest = join(out, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, html);
  if (!noindex) sitemap.push(canonical);
}

sitemap.sort((a, b) => a.length - b.length || a.localeCompare(b));
writeFileSync(
  join(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    sitemap.map((u) => `  <url><loc>${u}</loc></url>`).join("\n") +
    `\n</urlset>\n`
);

if (!existsSync(join(out, "robots.txt"))) throw new Error("public/robots.txt is missing");
console.log(`Built ${sitemap.length} indexed page(s) into dist/`);
