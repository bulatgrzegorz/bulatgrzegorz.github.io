import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import mermaid from "astro-mermaid";
import { unified } from "@astrojs/markdown-remark";
import config from "./astro-paper.config";

export default defineConfig({
  site: config.site.url,
  trailingSlash: "always",
  integrations: [
    mermaid({
      theme: "base",
      autoTheme: false,
      enableLog: false,
      mermaidConfig: {
        themeVariables: {
          darkMode: true,
          background: "#151c27",
          primaryColor: "#243954",
          primaryTextColor: "#e7edf5",
          primaryBorderColor: "#93b7fd",
          secondaryColor: "#223d35",
          secondaryTextColor: "#e7edf5",
          tertiaryColor: "#362d4b",
          tertiaryTextColor: "#e7edf5",
          lineColor: "#b5c1d1",
          textColor: "#e7edf5",
          actorBkg: "#243954",
          actorBorder: "#93b7fd",
          actorTextColor: "#e7edf5",
          actorLineColor: "#b5c1d1",
          signalColor: "#b5c1d1",
          signalTextColor: "#e7edf5",
          labelBoxBkgColor: "#202b3b",
          labelBoxBorderColor: "#93b7fd",
          labelTextColor: "#e7edf5",
          loopTextColor: "#e7edf5",
          noteBkgColor: "#362d4b",
          noteTextColor: "#e7edf5",
          noteBorderColor: "#c5a6f7",
        },
      },
    }),
    sitemap(),
  ],
  i18n: {
    locales: ["en"],
    defaultLocale: "en",
    routing: { prefixDefaultLocale: false },
  },
  markdown: {
    processor: unified(),
    shikiConfig: {
      themes: { light: "github-light", dark: "github-dark" },
      defaultColor: false,
      wrap: false,
      langAlias: { code: "text" },
    },
  },
  vite: { plugins: [tailwindcss()] },
});
