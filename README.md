# Grzegorz Bułat’s blog

A personal technical blog about C# / .NET, distributed systems, testing, and developer tools, published at [bulatgrzegorz.github.io](https://bulatgrzegorz.github.io/).

The site uses Astro with a customized [AstroPaper](https://github.com/satnaing/astro-paper) theme: dark mode, image cards, Mermaid diagrams, and Pagefind search. The app lives in `_preview/astro-paper/`; that directory now contains the production site.

## Local development

Use Node.js 24, then run:

```console
cd _preview/astro-paper
npm ci
npm run build
npm run dev
```

Open [localhost:4321](http://localhost:4321/). See the [Astro app README](_preview/astro-paper/README.md) for validation commands and diagram editing.

## Content

Published posts live in `_posts/` as `YYYY-MM-DD-slug.md` files. Their existing front matter and URLs are preserved. Drafts and planning notes are excluded from the build. The About page comes from `pages/about.md`.

Post covers use Cloudinary. Local illustrations live in `assets/img/posts/`. The refreshed diagrams have editable Excalidraw sources and self-contained SVG exports, listed in `assets/img/posts/diagrams.json`.

## Deployment

The [GitHub Actions workflow](.github/workflows/deploy-pages.yml) builds and checks the Astro site on every push to `master`, then deploys `_preview/astro-paper/dist/` to GitHub Pages. It can also be run manually from the Actions tab. Pages must use **GitHub Actions** as its publishing source.

The old Jekyll/Jekflix configuration and assets remain for reference. Publishing no longer uses Gulp or Jekyll.

## Licenses

AstroPaper’s MIT license is included in [_preview/astro-paper/LICENSE](_preview/astro-paper/LICENSE). The legacy Jekflix template’s license remains in [LICENSE](LICENSE).
