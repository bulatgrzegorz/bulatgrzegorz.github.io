import assert from "node:assert/strict";
import { readFile, writeFile, access } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const assets = new URL("../../../assets/img/posts/", import.meta.url);
const toolsDirectory = resolve(
  process.env.DIAGRAM_TOOLS ?? "/private/tmp/blog-diagram-tools"
);

// Export tooling stays outside the blog's runtime dependencies.
export default async function exportDiagrams(page) {
  const require = createRequire(`${toolsDirectory}/package.json`);
  const { build } = require("esbuild");
  const excalidraw = require.resolve("@excalidraw/excalidraw");
  const libraryDirectory = new URL("./", pathToFileURL(excalidraw));
  const bundle = resolve(toolsDirectory, "diagram-export.js");
  await build({
    stdin: {
      contents: `import { restoreElements, exportToSvg } from ${JSON.stringify(excalidraw)};
        window.exportDiagram = async scene => {
          const options = {appState: {...scene.appState, exportBackground: true, exportWithDarkMode: false, exportEmbedScene: false}, files: scene.files ?? {}, exportPadding: 32};
          const initial = await exportToSvg({...options, elements: restoreElements(scene.elements, null, {repairBindings: true})});
          const fonts = document.createElement('style');
          fonts.textContent = [...initial.querySelectorAll('style')].map(style => style.textContent).join('\\n');
          document.head.append(fonts);
          await Promise.all([...document.fonts].map(font => font.load()));
          const elements = restoreElements(scene.elements, null, {repairBindings: true, refreshDimensions: true});
          for (const element of elements) {
            if (element.type !== 'text' || !element.containerId) continue;
            const container = elements.find(item => item.id === element.containerId);
            if (container?.type !== 'rectangle') continue;
            element.x = container.x + (container.width - element.width) / 2;
            element.y = container.y + (container.height - element.height) / 2;
          }
          const svg = await exportToSvg({...options, elements});
          document.body.append(svg);
          await document.fonts.ready;
          const canvas = svg.getBoundingClientRect();
          for (const label of svg.querySelectorAll('text')) {
            const bounds = label.getBoundingClientRect();
            if (bounds.left < canvas.left - 1 || bounds.right > canvas.right + 1 || bounds.top < canvas.top - 1 || bounds.bottom > canvas.bottom + 1) {
              throw new Error('Diagram label exceeds its canvas: ' + label.textContent);
            }
          }
          svg.remove();
          return svg.outerHTML;
        };`,
      resolveDir: toolsDirectory,
    },
    bundle: true,
    outfile: bundle,
    format: "esm",
    define: { "process.env.NODE_ENV": '"production"' },
    loader: { ".woff2": "dataurl", ".woff": "dataurl", ".ttf": "dataurl" },
    logLevel: "warning",
  });
  await page.route("http://diagram-export.local/**", async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/") {
      return route.fulfill({
        contentType: "text/html",
        body: '<html><body><script>window.EXCALIDRAW_ASSET_PATH="http://diagram-export.local/assets/";</script><script type="module" src="/bundle.js"></script></body></html>',
      });
    }
    const file =
      pathname === "/bundle.js"
        ? bundle
        : new URL(pathname.replace("/assets/", ""), libraryDirectory);
    await route.fulfill({
      body: await readFile(file),
      contentType: pathname.endsWith(".js") ? "text/javascript" : "font/woff2",
    });
  });
  await page.goto("http://diagram-export.local/");
  await page.waitForFunction(() => typeof window.exportDiagram === "function");
  const diagrams = JSON.parse(await readFile(new URL("diagrams.json", assets)));
  for (const diagram of diagrams) {
    const scene = JSON.parse(await readFile(new URL(diagram.source, assets)));
    let svg;
    if (diagram.animated) {
      const frames = [];
      for (let step = 0; step < 4; step++) {
        const elements = scene.elements
          .filter(element => element.groupIds.includes(`pipeline-step-${step}`))
          .map(element => ({ ...element, y: element.y - step * 600 }));
        assert(elements.length, `Missing animation stage ${step}`);
        frames.push(
          await page.evaluate(scene => window.exportDiagram(scene), {
            ...scene,
            elements,
          })
        );
      }
      const sizes = frames.map(frame =>
        frame
          .match(/viewBox="([^"]+)"/)[1]
          .split(" ")
          .map(Number)
      );
      const width = Math.max(...sizes.map(size => size[2]));
      const height = Math.max(...sizes.map(size => size[3]));
      const panels = frames
        .map(
          (frame, index) =>
            `<g class="diagram-step step-${index}" style="animation-delay:${index === 0 ? 0 : -(16 - index * 4)}s">${frame.replace(/<svg\b[^>]*>/, `<svg x="0" y="0" width="${sizes[index][2]}" height="${sizes[index][3]}" viewBox="${sizes[index].join(" ")}">`)}</g>`
        )
        .join("");
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#151c27"/><style>.diagram-step{opacity:0;animation:show-step 16s steps(1,end) infinite}@keyframes show-step{0%,24.999%{opacity:1}25%,100%{opacity:0}}@media(prefers-reduced-motion:reduce){.diagram-step{animation:none}.step-0{opacity:1}}</style>${panels}</svg>`;
    } else {
      svg = await page.evaluate(scene => window.exportDiagram(scene), scene);
    }
    const output = new URL(diagram.svg, assets);
    const previous = await readFile(output, "utf8");
    const title = previous.match(/<title>[^<]*<\/title>/)?.[0];
    if (title) svg = svg.replace(/(<svg\b[^>]*>)/, `$1${title}`);
    await writeFile(output, svg);
    process.stdout.write(`Exported ${diagram.svg}\n`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const require = createRequire(`${toolsDirectory}/package.json`);
  const { chromium } = require("playwright");
  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const executablePath =
    process.env.DIAGRAM_CHROME ??
    (await access(chrome).then(
      () => chrome,
      () => undefined
    ));
  const browser = await chromium.launch({ executablePath });
  try {
    await exportDiagrams(await browser.newPage());
  } finally {
    await browser.close();
  }
}
