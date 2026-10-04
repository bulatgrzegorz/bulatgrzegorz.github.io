import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";
const posts = defineCollection({
  loader: glob({
    base: "../../_posts",
    pattern: "[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-*.md",
    generateId: ({ entry }) =>
      entry
        .replace(/^\d{4}-\d{2}-\d{2}-/, "")
        .replace(/\.md$/, "")
        .toLowerCase(),
  }),
  schema: z
    .object({
      date: z.preprocess(
        value =>
          typeof value === "string" &&
          /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
            ? `${value.replace(" ", "T")}Z`
            : value,
        z.coerce.date()
      ),
      title: z.string(),
      subtitle: z.string().nullable().optional(),
      description: z.string(),
      image: z.string().optional(),
      optimized_image: z.string().optional(),
      tags: z.array(z.string()),
      author: z.string(),
    })
    .transform(data => ({
      ...data,
      pubDatetime: data.date,
      ogImage: data.image,
      modDatetime: undefined,
      canonicalURL: undefined,
      timezone: "UTC",
      featured: false,
      draft: false,
      hideEditPost: true,
    })),
});

const pages = defineCollection({
  loader: glob({ base: "../../pages", pattern: "about.md" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    ogImage: z.string().optional(),
    canonicalURL: z.string().optional(),
  }),
});

export const collections = { posts, pages };
