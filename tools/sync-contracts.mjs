/**
 * Copies the Rinder contract addresses from rinder-contracts into config.js.
 * Run with `npm run contracts:sync` after `bash deploy-mainnet.sh`.
 *
 *   node tools/sync-contracts.mjs [path to deployments json]
 *
 * Default source: ../rinder-contracts/deployments/mainnet.json
 * Only the core, registry and verifier lines inside `contracts` change.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = process.argv[2] || new URL("../../rinder-contracts/deployments/mainnet.json", import.meta.url);
const dep = JSON.parse(readFileSync(source, "utf8"));
const isAddress = (v) => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);

const configPath = `${root}config.js`;
let config = readFileSync(configPath, "utf8");
if (Number(dep.chainId) !== 4663) throw new Error(`deployments chainId is ${dep.chainId}, expected 4663`);

const block = config.match(/  contracts: \{[\s\S]*?\n  \},/);
if (!block) throw new Error("No contracts block in config.js");
let next = block[0];
for (const key of ["core", "registry", "verifier"]) {
  if (!isAddress(dep[key])) throw new Error(`deployments ${key} is not a 0x address`);
  const line = new RegExp(`(\\n    ${key}: )"[^"]*"`);
  if (!line.test(next)) throw new Error(`No ${key} line in config.js contracts`);
  next = next.replace(line, `$1"${dep[key]}"`);
}
config = config.replace(block[0], next).replace(
  /\n  \/\/[^\n]*\n  contracts: \{/,
  `\n  // Rinder contracts on Robinhood Chain, deployed from block ${Number(dep.deployBlock)}.\n  contracts: {`,
);
writeFileSync(configPath, config);
console.log(`config.js contracts: core ${dep.core}, registry ${dep.registry}, verifier ${dep.verifier}`);
