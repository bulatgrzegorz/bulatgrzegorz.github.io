import { cp } from "node:fs/promises";

await cp(
  new URL("../../../assets/img/", import.meta.url),
  new URL("../public/assets/img/", import.meta.url),
  {
    recursive: true,
  }
);
await cp(
  new URL("../../../assets/img/blog-image.png", import.meta.url),
  new URL("../public/blog-image.png", import.meta.url)
);
