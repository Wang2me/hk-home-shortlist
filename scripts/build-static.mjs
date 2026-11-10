import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "dist");
const files = ["index.html", "styles.css", "app.js", "cloud.js", "config.js", ".nojekyll"];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(files.map((file) => copyFile(resolve(root, file), resolve(output, file))));
console.log(`Built ${files.length} static files in dist/`);
