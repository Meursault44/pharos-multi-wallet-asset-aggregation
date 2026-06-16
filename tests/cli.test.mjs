import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsxCli = path.join(repoDir, "node_modules", "tsx", "dist", "cli.mjs");
const script = path.join(repoDir, "scripts", "aggregate-assets.ts");

function run(args) {
  return spawnSync(process.execPath, [tsxCli, script, ...args], {
    cwd: repoDir,
    encoding: "utf8",
  });
}

test("help documents the configured default network", () => {
  const result = run(["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /atlantic-testnet \(default\) or mainnet/);
});

test("missing wallets returns a stable machine-readable error", () => {
  const result = run([]);
  assert.equal(result.status, 1);
  const error = JSON.parse(result.stderr);
  assert.equal(error.code, "MISSING_WALLETS");
});

test("invalid output format returns a stable error before RPC", () => {
  const result = run([
    "--wallets",
    "0x1111111111111111111111111111111111111111",
    "--format",
    "yaml",
  ]);
  assert.equal(result.status, 1);
  const error = JSON.parse(result.stderr);
  assert.equal(error.code, "UNSUPPORTED_FORMAT");
});

test("rejects aliases and points users to the address-book skill", () => {
  const result = run(["--wallets", "MAIN"]);
  assert.equal(result.status, 1);
  const error = JSON.parse(result.stderr);
  assert.equal(error.code, "INVALID_WALLET_ADDRESS");
  assert.match(error.hint, /pharos-wallet-address-book/);
});

test("rejects wallet-book loading and points users to the address-book skill", () => {
  const result = run(["--wallets", "0x1111111111111111111111111111111111111111", "--wallet-book", "wallets.json"]);
  assert.equal(result.status, 1);
  const error = JSON.parse(result.stderr);
  assert.equal(error.code, "WALLET_ALIAS_UNSUPPORTED");
  assert.match(error.hint, /pharos-wallet-address-book/);
});
