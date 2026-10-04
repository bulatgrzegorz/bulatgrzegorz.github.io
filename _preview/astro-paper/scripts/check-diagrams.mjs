import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const assets = new URL("../../../assets/img/posts/", import.meta.url);
const posts = new URL("../../../_posts/", import.meta.url);
const diagrams = JSON.parse(await readFile(new URL("diagrams.json", assets)));
const published = (await readdir(posts)).filter(name =>
  /^\d{4}-\d{2}-\d{2}-.+\.md$/.test(name)
);
const content = (
  await Promise.all(
    published.map(name => readFile(new URL(name, posts), "utf8"))
  )
).join("\n");
const luminance = color => {
  const channels = color
    .slice(1)
    .match(/../g)
    .map(value => parseInt(value, 16) / 255)
    .map(value =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    );
  return channels.reduce(
    (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
    0
  );
};
let labels = 0;
for (const diagram of diagrams) {
  assert(content.includes(`/assets/img/posts/${diagram.svg}`));
  assert(
    !content.includes(`/assets/img/posts/${diagram.original}`),
    `Old diagram still used: ${diagram.original}`
  );
  const svg = await readFile(new URL(diagram.svg, assets), "utf8");
  const scene = JSON.parse(await readFile(new URL(diagram.source, assets)));
  assert.equal(scene.type, "excalidraw");
  assert(svg.includes('fill="#151c27"'), `Missing dark canvas: ${diagram.svg}`);
  assert(svg.includes("data:font"), `Font is not embedded: ${diagram.svg}`);
  assert(!/<script\b|(?:href|url\()\s*["']?https?:/i.test(svg));
  if (diagram.animated) {
    assert(svg.includes("@keyframes show-step"));
    assert(svg.includes("prefers-reduced-motion"));
    assert.equal((svg.match(/class="diagram-step /g) ?? []).length, 4);
  }
  for (const element of scene.elements.filter(
    element => element.type === "text" && !element.isDeleted
  )) {
    const container = scene.elements.find(
      item => item.id === element.containerId
    );
    const background =
      container?.backgroundColor && container.backgroundColor !== "transparent"
        ? container.backgroundColor
        : scene.appState.viewBackgroundColor;
    const levels = [element.strokeColor, background].map(luminance);
    const contrast =
      (Math.max(...levels) + 0.05) / (Math.min(...levels) + 0.05);
    assert(
      contrast >= 4.5,
      `Low contrast (${contrast.toFixed(2)}:1) in ${diagram.svg}: ${element.text}`
    );
    labels++;
  }
}
process.stdout.write(
  `Verified ${diagrams.length} SVG diagrams, editable sources, ${labels} readable labels, and two animations with reduced-motion support.\n`
);
