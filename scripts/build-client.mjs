import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const body = await readFile(join(root, "src", "client-body.js"), "utf8");
const output = `window.__ModuleLoader__.load({
  id: "dsh-access-mode",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${body.split("\n").map((line) => `    ${line}`).join("\n")}
    return module.exports;
  }
});
`;
await writeFile(join(root, "lib", "client.js"), output, "utf8");
