# Astro blog

This blog uses [AstroPaper](https://github.com/satnaing/astro-paper), based on upstream version 6.1.0. The Astro app lives in this directory and reads the original posts and images from the repository root. GitHub Actions publishes its build to GitHub Pages.

```console
cd _preview/astro-paper
npm ci
npm run build
npm run check:migration
npm run check:diagrams
npm run dev
```

Use Node.js 24, matching the deployment workflow. Open [localhost:4321](http://localhost:4321/). The build also generates the Pagefind search index.

Posts are loaded directly from `_posts/`; front matter and prose are preserved. Diagram image references use the new SVG exports. Only dated post filenames are imported, so drafts and planning notes are excluded. Existing slug URLs, `/feed.xml`, `/about/`, and `/assets/img/` paths are preserved. Zone-less publication timestamps are interpreted as UTC, matching Jekyll's default.

The blog uses a fixed dark theme, with a featured article and all remaining posts shown as image cards. It includes GitHub dark code colors, Mermaid diagrams using the site's palette, and a collapsible table of contents including H1 sections. Article metadata and Cloudinary cover images are adapted in the loader and layout.

## Editing diagrams

The 23 drawings in `assets/img/posts/diagrams.json` each have an editable `.excalidraw` source beside a self-contained SVG with embedded fonts and a dark canvas. Seven drawings were recovered from existing sources; the others were recreated. The two pipeline diagrams animate four stages and respect the reader's reduced-motion preference. Their sources group each stage separately.

Open a source in [Excalidraw](https://excalidraw.com/) to edit it. To regenerate the SVGs using the official local API, install the export tools outside the blog and run:

```console
npm install --prefix /private/tmp/blog-diagram-tools @excalidraw/excalidraw@0.18.1 esbuild playwright
node scripts/export-diagrams.mjs
npm run check:diagrams
npm run build
```

The exporter uses installed Chrome on macOS, or Playwright's Chromium on other platforms. `DIAGRAM_TOOLS` overrides the tools directory; `DIAGRAM_CHROME` selects a browser executable. Excalidraw is not added to the website's runtime dependencies. Original raster images are retained for reference.

Change blog settings in `astro-paper.config.ts` and code themes in `astro.config.ts`. The files under `public/assets/`, `public/pagefind/`, `.astro/`, and `dist/` are generated.

## Publishing

[Deploy blog to GitHub Pages](../../.github/workflows/deploy-pages.yml) runs on every push to `master`, or manually from the Actions tab. It installs locked dependencies with Node.js 24, checks the source and diagrams, builds the site and search index, validates the migrated posts and assets, then deploys only `dist/`. GitHub Pages uses **GitHub Actions** as its publishing source.

Add or edit dated Markdown files in `_posts/` and commit their referenced images along with them. No local Gulp or Jekyll build is needed. The legacy Jekyll files remain in the repository for reference; comments and the old contact form have not been migrated.

AstroPaper is distributed under the included MIT [license](LICENSE).
