import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";

const postsDir = new URL("../../../_posts/", import.meta.url);
const distDir = new URL("../dist/", import.meta.url);
const filenames = (await readdir(postsDir)).filter(name =>
  /^\d{4}-\d{2}-\d{2}-.+\.md$/.test(name)
);
const feed = await readFile(new URL("feed.xml", distDir), "utf8");
const homepage = await readFile(new URL("index.html", distDir), "utf8");
let diagrams = 0;
let images = 0;

for (const filename of filenames) {
  const source = await readFile(new URL(filename, postsDir), "utf8");
  const slug = filename
    .replace(/^\d{4}-\d{2}-\d{2}-/, "")
    .replace(/\.md$/, "")
    .toLowerCase();
  const html = await readFile(new URL(`${slug}/index.html`, distDir), "utf8");
  const url = `https://bulatgrzegorz.github.io/${slug}/`;
  assert(
    homepage.includes(`href="/${slug}/"`),
    `Missing homepage article for ${filename}`
  );
  assert(
    html.includes(`rel="canonical" href="${url}"`),
    `Canonical URL changed for ${filename}`
  );
  assert(feed.includes(url), `Missing RSS entry for ${filename}`);
  const date = source.match(/^date: (.+)$/m)[1];
  assert(
    html.includes(new Date(`${date.replace(" ", "T")}Z`).toISOString()),
    `Publication date changed for ${filename}`
  );

  const expectedDiagrams = (source.match(/^```mermaid/gm) ?? []).length;
  const renderedDiagrams = (
    html.match(/<pre[^>]*class="[^"]*\bmermaid\b/g) ?? []
  ).length;
  assert.equal(
    renderedDiagrams,
    expectedDiagrams,
    `Missing Mermaid blocks in ${filename}`
  );
  diagrams += expectedDiagrams;

  for (const [, image] of source.matchAll(
    /!\[[^\]]*\]\((\/assets\/[^)\s]+)\)/g
  )) {
    await access(new URL(image.slice(1), distDir));
    images++;
  }
}

await access(new URL("about/index.html", distDir));
await access(new URL("rss.xml", distDir));
await access(new URL("pagefind/pagefind.js", distDir));
assert(
  !feed.includes("incident-repair-harness-plan"),
  "Planning document was published"
);
process.stdout.write(
  `Verified all ${filenames.length} posts on the homepage, post URLs and publication dates, ${diagrams} Mermaid blocks, ${images} local image references, RSS, About, and search assets.\n`
);
