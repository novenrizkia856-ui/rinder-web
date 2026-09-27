/**
 * Copy and content audit. Run with `npm run audit`.
 *
 *   1. No hyphen, en dash or em dash in the landing page's visible copy.
 *   2. No visible sentence over 15 words.
 *   3. No sentence dash in strings the scripts render.
 *   4. Nothing left over from the reference site, no EVM or multichain terms,
 *      no hype words.
 *   5. No Solana address outside config.js.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const failures = [];
const fail = (msg) => failures.push(msg);

const strip = (html) =>
  html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<head[\s\S]*?<\/head>/i, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<(pre|code)[\s\S]*?<\/\1>/gi, "");

// 1 and 2: visible text of index.html
const html = readFileSync(join(root, "index.html"), "utf8");
const text = strip(html).replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ").trim();
for (const [ch, name] of [["-", "hyphen"], ["–", "en dash"], ["—", "em dash"]]) {
  const i = text.indexOf(ch);
  if (i !== -1) fail(`index.html: ${name} in visible copy near "${text.slice(Math.max(0, i - 40), i + 40)}"`);
}
const attrs = [...html.matchAll(/(?:placeholder|aria-label|title|content)="([^"]*)"/g)].map((m) => m[1]);
for (const a of attrs) if (/[–—]| - /.test(a)) fail(`index.html: dash in attribute text "${a}"`);
const nodes = [...strip(html).replace(/<\/?(br|b|span|a|i|kbd)\b[^>]*>/gi, " ").matchAll(/>([^<>]+)</g)].map((m) => m[1].replace(/\s+/g, " ").trim()).filter(Boolean);
for (const node of nodes) {
  for (const sentence of node.split(/(?<=[.!?])\s+/)) {
    const words = sentence.split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
    if (words.length > 15) fail(`index.html: sentence over 15 words: "${sentence}"`);
  }
}

// Collect source files
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".git", "fonts", ".vercel"].includes(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(html|js|mjs|css|json|md)$/.test(name) && name !== "package-lock.json") files.push(path);
  }
};
walk(root);

const LEFTOVERS = [
  /general intelligence/i, /cofounder/i, /new york/i, /\bnyc\b/i, /knicks/i, /altalogy/i, /pignanelli/i, /intelligenceco/i,
  /ethereum/i, /\bevm\b/i, /solidity/i, /arbitrum/i, /polygon/i, /\bbnb\b/i, /\bbase chain\b/i, /robinhood/i, /multichain/i, /metamask/i,
  /\b0x[0-9a-f]{40}\b/i, /lorem ipsum/i, /\bTODO\b/, /tokenomics/i, /presale/i, /airdrop/i,
  /revolutionary/i, /game changing/i, /\bmoon\b/i, /\b100x\b/i, /\bweb3\b/i, /financial freedom/i, /next big thing/i,
];
const ADDRESS = /["'`]([1-9A-HJ-NP-Za-km-z]{32,44})["'`]/;
// En and em dashes anywhere, or " - " between words inside a string literal
const SENTENCE_DASH = /[–—]|(["'])[^"'\n]*[A-Za-z] - [A-Za-z][^"'\n]*\1/;

for (const file of files) {
  const rel = relative(root, file).replace(/\\/g, "/");
  if (rel === "tools/check-copy.mjs") continue;
  const source = readFileSync(file, "utf8");
  for (const pattern of LEFTOVERS) {
    // CSS clip-path uses polygon(), which is not the chain
    if (rel.endsWith(".css") && String(pattern) === "/polygon/i") continue;
    if (pattern.test(source)) fail(`${rel}: matches ${pattern}`);
  }
  if (/\.(js|mjs|html)$/.test(file) && rel !== "config.js" && !rel.startsWith("test/")) {
    const m = source.match(ADDRESS);
    if (m) fail(`${rel}: hardcoded Solana address ${m[1]}. Addresses belong in config.js.`);
  }
  if (/^(assets\/js|data)\//.test(rel)) {
    for (const line of source.split("\n")) {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      if (SENTENCE_DASH.test(line)) fail(`${rel}: sentence dash in rendered string: ${line.trim().slice(0, 100)}`);
    }
  }
}

if (failures.length) {
  console.error(`Copy audit failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`Copy audit passed (${files.length} files)`);
