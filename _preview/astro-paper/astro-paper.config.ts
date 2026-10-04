import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: {
    url: "https://bulatgrzegorz.github.io/",
    title: "Grzegorz Bułat",
    description: "C# Developer. Technology, gadgets, sport",
    author: "Grzegorz Bułat",
    profile: "https://bulatgrzegorz.github.io/about/",
    ogImage: "blog-image.png",
    lang: "en",
    timezone: "UTC",
  },
  posts: { perPage: 6, perIndex: 6 },
  features: {
    lightAndDarkMode: false,
    dynamicOgImage: false,
    showArchives: true,
    showBackButton: true,
    editPost: { enabled: false },
    search: "pagefind",
  },
  socials: [
    { name: "github", url: "https://github.com/bulatgrzegorz" },
    {
      name: "linkedin",
      url: "https://www.linkedin.com/in/grzegorz-bułat-009b65b3/",
    },
    { name: "mail", url: "mailto:grzegorz.bulat1@gmail.com" },
  ],
});
