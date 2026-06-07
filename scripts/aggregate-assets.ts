#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SELECTORS = {
  name: "06fdde03",
  symbol: "95d89b41",
  decimals: "313ce567",
  balanceOf: "70a08231",
} as const;

const WALLET_BOOK_FILE = path.join(__dirname, "..", "assets", "wallet-labels.json");
const WALLET_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,40}$/;

type CliArgs = Record<string, string | boolean>;

type WalletSpec = {
  label: string | null;
  address: string;
};

type WalletBook = Record<string, string>;

type NetworkConfig = {
  name: string;
  rpcUrl: string;
  chainId: number | null;
  explorerUrl?: string;
  explorerApiUrl?: string;
  nativeToken?: string;
};

type NetworksFile = {
  networks: NetworkConfig[];
  defaultNetwork?: string;
};

type TokenConfig = {
  symbol?: string;
  name?: string;
  decimals?: number;
  address: string;
  isNative?: boolean;
};

type ResolvedAssets = {
  assetsDir: string;
  networks: NetworksFile;
  tokens: Record<string, TokenConfig[]>;
};

type AssetBalance = Required<Pick<TokenConfig, "address" | "symbol" | "name" | "decimals">> & {
  isNative: boolean;
  balanceRaw: string;
  balance: string | null;
};

type AssetTotal = AssetBalance & {
  walletsWithBalance: number;
};

type ActivitySample = {
  sampledTransactions: number;
  gasSpentNative: string;
};

type WalletReport = {
  label: string | null;
  address: string;
  explorerUrl: string | null;
  nativeBalance: string | null;
  activity: ActivitySample | null;
  assets: AssetBalance[];
};

type Report = {
  network: string;
  chainId: number | null;
  rpcUrl: string;
  assetsDir: string;
  nativeSymbol: string;
  blockNumber: number;
  snapshotTime: string;
  walletCount: number;
  tokenCount: number;
  discovery: {
    enabled: boolean;
    discoveredTokenCount: number;
  };
  totals: AssetTotal[];
  rankings: {
    nativeRichest: {
      label: string | null;
      address: string;
      nativeBalance: string | null;
    } | null;
    mostActive: {
      label: string | null;
      address: string;
      sampledTransactions: number;
      gasSpentNative: string;
    } | null;
  };
  wallets: WalletReport[];
  warnings: string[];
};

type OutputMode = "human" | "json" | "csv";

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    args[key.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return args;
}

function stringArg(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function boolArg(value: string | boolean | undefined): boolean {
  return value === true || value === "true";
}

function printHelp(): void {
  console.log(`Pharos multi-wallet asset aggregation

Usage:
  npm run aggregate -- --wallets 0xWallet1,0xWallet2 [options]

Options:
  --wallets <list>          Comma/space separated wallets; labels accepted as Name:0x...
  --add-wallet <name:addr>  Save a wallet name in assets/wallet-labels.json
  --list-wallets           List saved wallet names
  --remove-wallet <name>    Remove a saved wallet name
  --network <name>          mainnet (default) or atlantic-testnet
  --tokens <list>           Extra ERC20 token addresses to scan
  --format <human|json|csv> Output format, default human
  --totals-only             Show/export only aggregate asset totals
  --include-zero            Include zero ERC20 balances in per-wallet output
  --discover                Discover ERC20 candidates from explorer transfers
  --max-discovered <n>      Cap discovered token contracts, default 20
  --activity                Sample recent explorer transactions and gas spent
  --save <path>             Write the report to a file instead of stdout
  --assets-dir <path>       Override networks.json/tokens.json directory
  --rpc-url <url>           Override RPC URL

Examples:
  npm run aggregate -- --add-wallet Main:0x...
  npm run aggregate -- --wallets Main,Trading
  npm run aggregate -- --wallets Main:0x...,Trading:0x...
  npm run aggregate -- --wallets 0x...,0x... --totals-only
  npm run aggregate -- --wallets 0x...,0x... --format csv --save report.csv`);
}

function resolveFormat(value: string | undefined): OutputMode {
  const format = value || "human";
  if (format === "human" || format === "json" || format === "csv") return format;
  throw new Error(`Unsupported format: ${format}. Use human, json, or csv.`);
}

function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isWalletName(value: unknown): value is string {
  return typeof value === "string" && WALLET_NAME_PATTERN.test(value) && !value.startsWith("0x");
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function loadWalletBook(): WalletBook {
  if (!fs.existsSync(WALLET_BOOK_FILE)) return {};
  const parsed = loadJson<unknown>(WALLET_BOOK_FILE);
  if (!isRecord(parsed)) throw new Error(`Invalid wallet address book: ${WALLET_BOOK_FILE}`);
  const book: WalletBook = {};
  for (const [name, address] of Object.entries(parsed)) {
    if (!isWalletName(name)) throw new Error(`Invalid saved wallet name: ${name}`);
    if (!isAddress(address)) throw new Error(`Invalid saved wallet address for ${name}: ${String(address)}`);
    book[name] = address;
  }
  return book;
}

function saveWalletBook(book: WalletBook): void {
  fs.mkdirSync(path.dirname(WALLET_BOOK_FILE), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(book).sort(([left], [right]) => left.localeCompare(right)));
  fs.writeFileSync(WALLET_BOOK_FILE, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
}

function parseNamedAddress(value: string): WalletSpec {
  const match = value.match(/^\s*([A-Za-z0-9_.-]{1,40})\s*:\s*(0x[a-fA-F0-9]{40})\s*$/);
  if (!match) throw new Error(`Invalid wallet mapping: ${value}. Expected name:0xAddress.`);
  if (!isWalletName(match[1])) throw new Error(`Invalid wallet name: ${match[1]}. Use 1-40 letters, numbers, dots, underscores, or dashes; names cannot start with 0x.`);
  return { label: match[1], address: match[2] };
}

function parseWalletSpecs(value: string | undefined, walletBook: WalletBook): WalletSpec[] {
  if (!value) return [];
  return value
    .split(/[,\s;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      if (/^[A-Za-z0-9_.-]{1,40}\s*:\s*0x[a-fA-F0-9]{40}$/.test(item)) return parseNamedAddress(item);
      if (isAddress(item)) return { label: null, address: item };
      if (isWalletName(item) && walletBook[item]) return { label: item, address: walletBook[item] };
      if (isWalletName(item)) throw new Error(`Unknown wallet name: ${item}. Add it with --add-wallet ${item}:0xAddress.`);
      return { label: null, address: item };
    });
}

function splitAddresses(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function loadJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function resolveAssetsDir(explicitDir: string | undefined): ResolvedAssets {
  const candidates = [
    explicitDir,
    path.join(__dirname, "..", "assets"),
    path.join(__dirname, "..", "..", "pharos-skill-engine", "assets"),
    path.join(__dirname, "..", "..", ".agents", "skills", "pharos-skill-engine", "assets"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const assetsDir of candidates) {
    const networksPath = path.join(assetsDir, "networks.json");
    const tokensPath = path.join(assetsDir, "tokens.json");
    if (fs.existsSync(networksPath) && fs.existsSync(tokensPath)) {
      return {
        assetsDir,
        networks: loadJson<NetworksFile>(networksPath),
        tokens: loadJson<Record<string, TokenConfig[]>>(tokensPath),
      };
    }
  }
  throw new Error("Unable to find Pharos assets directory with networks.json and tokens.json");
}

function resolveConfig(networkName: string | undefined, rpcOverride: string | undefined, assetsOverride: string | undefined) {
  const { assetsDir, networks, tokens } = resolveAssetsDir(assetsOverride);
  const selected = networkName || networks.defaultNetwork || "mainnet";
  const network = networks.networks.find((item) => item.name === selected);
  if (!network && !rpcOverride) throw new Error(`Unsupported network: ${selected}`);
  const resolvedNetwork: NetworkConfig = network || { name: selected, rpcUrl: rpcOverride!, chainId: null, nativeToken: "UNKNOWN" };
  return {
    assetsDir,
    network: resolvedNetwork,
    rpcUrl: rpcOverride || resolvedNetwork.rpcUrl,
    knownTokens: tokens[selected] || [],
  };
}

async function rpc<T = unknown>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const json = (await response.json()) as { error?: { code: number; message: string }; result?: T };
  if (json.error) throw new Error(`${json.error.code}: ${json.error.message}`);
  return json.result as T;
}

async function ethCall(rpcUrl: string, to: string, data: string, blockTag?: string): Promise<string> {
  return rpc<string>(rpcUrl, "eth_call", [{ to, data }, blockTag || "latest"]);
}

async function fetchJson(url: string, timeoutMs = 8000): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, { headers: { accept: "application/json" }, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function padAddress(address: string): string {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function decodeUint(hex: string | null | undefined): string | null {
  if (!hex || hex === "0x") return null;
  return BigInt(hex).toString();
}

function decodeString(hex: string | null | undefined): string | null {
  if (!hex || hex === "0x") return null;
  const raw = hex.slice(2);
  try {
    if (raw.length === 64) {
      return Buffer.from(raw, "hex").toString("utf8").replace(/\0+$/g, "") || null;
    }
    const offset = Number(BigInt(`0x${raw.slice(0, 64)}`));
    const lengthStart = offset * 2;
    const length = Number(BigInt(`0x${raw.slice(lengthStart, lengthStart + 64)}`));
    const dataStart = lengthStart + 64;
    return Buffer.from(raw.slice(dataStart, dataStart + length * 2), "hex").toString("utf8") || null;
  } catch {
    return null;
  }
}

function formatAmount(raw: string | null | undefined, decimals: number): string | null {
  if (raw === null || raw === undefined) return null;
  const value = BigInt(raw);
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = value % scale;
  if (fraction === 0n) return whole.toString();
  const fractionText = fraction.toString().padStart(decimals, "0").replace(/0+$/g, "");
  return `${whole}.${fractionText}`;
}

function decimalToNumber(value: string | null): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function uniqByAddress(tokens: TokenConfig[]): TokenConfig[] {
  const seen = new Set<string>();
  const result: TokenConfig[] = [];
  for (const token of tokens) {
    if (!isAddress(token.address)) continue;
    const key = token.address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(token);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function collectTokenAddresses(value: unknown, found = new Set<string>(), keyHint = ""): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectTokenAddresses(item, found, keyHint);
    return found;
  }
  if (!isRecord(value)) return found;
  for (const [key, item] of Object.entries(value)) {
    const nextHint = `${keyHint}.${key}`.toLowerCase();
    if (isAddress(item) && /(token|contract).*address|address.*(token|contract)|token|contract/.test(nextHint)) {
      found.add(item);
    } else {
      collectTokenAddresses(item, found, nextHint);
    }
  }
  return found;
}

function extractList(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];
  for (const key of ["data", "items", "results", "transactions", "token_transfers"]) {
    const candidate = value[key];
    if (Array.isArray(candidate)) return candidate.filter(isRecord);
  }
  return [];
}

function explorerAddressUrl(network: NetworkConfig, address: string): string | null {
  if (!network.explorerUrl) return null;
  return `${network.explorerUrl.replace(/\/+$/, "")}/address/${address}`;
}

async function discoverTokens(network: NetworkConfig, wallets: WalletSpec[], warnings: string[], maxDiscovered: number): Promise<TokenConfig[]> {
  if (!network.explorerApiUrl) {
    warnings.push("Token discovery skipped: network has no explorerApiUrl");
    return [];
  }
  const discovered = new Set<string>();
  for (const wallet of wallets) {
    const url = `${network.explorerApiUrl.replace(/\/+$/, "")}/v1/explorer/address/${wallet.address}/token_transfers?limit=100&page=1`;
    try {
      const json = await fetchJson(url);
      collectTokenAddresses(json, discovered);
    } catch (error) {
      warnings.push(`Token discovery failed for ${wallet.address}: ${(error as Error).message}`);
    }
  }
  return Array.from(discovered).slice(0, maxDiscovered).map((address) => ({ address }));
}

async function readActivity(network: NetworkConfig, wallet: WalletSpec, warnings: string[]): Promise<ActivitySample | null> {
  if (!network.explorerApiUrl) return null;
  const url = `${network.explorerApiUrl.replace(/\/+$/, "")}/v1/explorer/address/${wallet.address}/transactions?limit=100&page=1`;
  try {
    const json = await fetchJson(url);
    const list = extractList(json);
    let gasSpentNative = 0;
    for (const tx of list) {
      const fee = tx.transaction_fee ?? tx.tx_fee ?? tx.fee ?? tx.gas_fee ?? tx.gasFee;
      gasSpentNative += decimalToNumber(typeof fee === "string" || typeof fee === "number" ? String(fee) : null);
    }
    return {
      sampledTransactions: list.length,
      gasSpentNative: gasSpentNative.toString(),
    };
  } catch (error) {
    warnings.push(`Activity read failed for ${wallet.address}: ${(error as Error).message}`);
    return null;
  }
}

async function readTokenMetadata(rpcUrl: string, token: TokenConfig, warnings: string[]): Promise<Required<Pick<TokenConfig, "address" | "symbol" | "name" | "decimals">>> {
  const knownDecimals = token.decimals;
  if (token.name && token.symbol && typeof knownDecimals === "number" && Number.isInteger(knownDecimals)) {
    return { address: token.address, name: token.name, symbol: token.symbol, decimals: knownDecimals };
  }
  async function tryRead<T>(label: string, selector: string, decoder: (hex: string) => T | null): Promise<T | null> {
    try {
      return decoder(await ethCall(rpcUrl, token.address, `0x${selector}`));
    } catch (error) {
      warnings.push(`Metadata read failed for ${token.address} ${label}: ${(error as Error).message}`);
      return null;
    }
  }
  const name = token.name || (await tryRead("name", SELECTORS.name, decodeString)) || token.address;
  const symbol = token.symbol || (await tryRead("symbol", SELECTORS.symbol, decodeString)) || token.address.slice(0, 10);
  const decimalsRaw = typeof knownDecimals === "number" && Number.isInteger(knownDecimals)
    ? String(knownDecimals)
    : await tryRead("decimals", SELECTORS.decimals, decodeUint);
  const decimals = decimalsRaw === null ? 18 : Number(decimalsRaw);
  if (decimalsRaw === null) warnings.push(`Using decimals=18 fallback for ${token.address}`);
  return { address: token.address, name, symbol, decimals };
}

function toCsv(report: Report, totalsOnly = false): string {
  if (totalsOnly) {
    const rows: Array<Array<string | number | boolean | null>> = [
      [
        "network",
        "block",
        "snapshot_time",
        "asset_symbol",
        "asset_name",
        "token_address",
        "balance_raw",
        "balance",
        "decimals",
        "is_native",
        "wallets_with_balance",
        "wallet_count",
      ],
    ];
    for (const asset of report.totals) {
      rows.push([
        report.network,
        report.blockNumber,
        report.snapshotTime,
        asset.symbol,
        asset.name,
        asset.address,
        asset.balanceRaw,
        asset.balance,
        asset.decimals,
        asset.isNative,
        asset.walletsWithBalance,
        report.walletCount,
      ]);
    }
    return rows.map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  }

  const rows: Array<Array<string | number | boolean | null>> = [
    [
      "network",
      "block",
      "snapshot_time",
      "wallet_label",
      "wallet",
      "asset_symbol",
      "asset_name",
      "token_address",
      "balance_raw",
      "balance",
      "decimals",
      "is_native",
      "explorer_url",
    ],
  ];
  for (const wallet of report.wallets) {
    for (const asset of wallet.assets) {
      rows.push([
        report.network,
        report.blockNumber,
        report.snapshotTime,
        wallet.label || "",
        wallet.address,
        asset.symbol,
        asset.name,
        asset.address,
        asset.balanceRaw,
        asset.balance,
        asset.decimals,
        asset.isNative,
        wallet.explorerUrl || "",
      ]);
    }
  }
  return rows.map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

function toHuman(report: Report, totalsOnly = false): string {
  const lines: string[] = [];
  lines.push("PHAROS MULTI-WALLET ASSET AGGREGATION");
  lines.push(`Network: ${report.network} (chain ${report.chainId || "unknown"})`);
  lines.push(`Snapshot: block ${report.blockNumber} at ${report.snapshotTime}`);
  lines.push(`Wallets: ${report.walletCount} | ERC20 tokens scanned: ${report.tokenCount}`);
  if (report.discovery.enabled) lines.push(`Discovery: ${report.discovery.discoveredTokenCount} extra token(s) from explorer transfers`);
  if (report.rankings.nativeRichest) {
    const winner = report.rankings.nativeRichest;
    lines.push(`Top native wallet: ${winner.label || shortAddress(winner.address)} with ${winner.nativeBalance} ${report.nativeSymbol}`);
  }
  lines.push("");
  lines.push("Aggregate holdings:");
  for (const asset of report.totals) {
    lines.push(`- ${asset.symbol}: ${asset.balance} (${asset.walletsWithBalance}/${report.walletCount} wallets)`);
  }
  if (totalsOnly) {
    if (report.warnings.length > 0) {
      lines.push("");
      lines.push("Warnings:");
      for (const warning of report.warnings) lines.push(`- ${warning}`);
    }
    lines.push("");
    lines.push("Note: balances are point-in-time reads and do not include off-chain prices.");
    return lines.join("\n");
  }
  lines.push("");
  lines.push("Wallet breakdown:");
  for (const wallet of report.wallets) {
    const name = wallet.label ? `${wallet.label} (${shortAddress(wallet.address)})` : shortAddress(wallet.address);
    const assets = wallet.assets.map((asset) => `${asset.symbol} ${asset.balance}`).join(", ") || "no nonzero assets";
    lines.push(`- ${name}: ${assets}`);
    if (wallet.activity) {
      lines.push(`  activity sample: ${wallet.activity.sampledTransactions} tx, gas ${wallet.activity.gasSpentNative}`);
    }
    if (wallet.explorerUrl) lines.push(`  explorer: ${wallet.explorerUrl}`);
  }
  if (report.rankings.nativeRichest) {
    const winner = report.rankings.nativeRichest;
    lines.push("");
    lines.push(`Highest native balance: ${winner.label || shortAddress(winner.address)} with ${winner.nativeBalance} ${report.nativeSymbol}`);
  }
  if (report.rankings.mostActive) {
    const active = report.rankings.mostActive;
    lines.push(`Most active sample: ${active.label || shortAddress(active.address)} with ${active.sampledTransactions} tx`);
  }
  if (report.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const warning of report.warnings) lines.push(`- ${warning}`);
  }
  lines.push("");
  lines.push("Note: balances are point-in-time reads and do not include off-chain prices.");
  return lines.join("\n");
}

function renderReport(report: Report, format: OutputMode, totalsOnly: boolean): string {
  if (format === "csv") return toCsv(report, totalsOnly);
  if (format === "json") {
    const output = totalsOnly
      ? {
          network: report.network,
          chainId: report.chainId,
          blockNumber: report.blockNumber,
          snapshotTime: report.snapshotTime,
          walletCount: report.walletCount,
          tokenCount: report.tokenCount,
          discovery: report.discovery,
          totals: report.totals,
          warnings: report.warnings,
        }
      : report;
    return JSON.stringify(output, null, 2);
  }
  return toHuman(report, totalsOnly);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (boolArg(args.help) || boolArg(args.h)) {
    printHelp();
    return;
  }
  const walletBook = loadWalletBook();
  const addWallet = stringArg(args["add-wallet"]);
  const removeWallet = stringArg(args["remove-wallet"]);
  if (addWallet) {
    const wallet = parseNamedAddress(addWallet);
    walletBook[wallet.label!] = wallet.address;
    saveWalletBook(walletBook);
    console.log(`Saved wallet ${wallet.label}: ${wallet.address}`);
    return;
  }
  if (removeWallet) {
    if (!isWalletName(removeWallet)) throw new Error(`Invalid wallet name: ${removeWallet}`);
    if (!walletBook[removeWallet]) throw new Error(`Unknown wallet name: ${removeWallet}`);
    delete walletBook[removeWallet];
    saveWalletBook(walletBook);
    console.log(`Removed wallet ${removeWallet}`);
    return;
  }
  if (boolArg(args["list-wallets"])) {
    const entries = Object.entries(walletBook);
    if (entries.length === 0) {
      console.log("No saved wallets.");
      return;
    }
    for (const [name, address] of entries) console.log(`${name}: ${address}`);
    return;
  }
  const wallets = parseWalletSpecs(stringArg(args.wallets) || stringArg(args.wallet), walletBook);
  const extraTokens = splitAddresses(stringArg(args.tokens) || stringArg(args.token));
  const format = resolveFormat(stringArg(args.format));
  const totalsOnly = boolArg(args["totals-only"]);
  const savePath = stringArg(args.save);
  const maxDiscovered = Number.isFinite(Number(args["max-discovered"])) ? Number(args["max-discovered"]) : 20;

  if (wallets.length === 0) throw new Error("Missing --wallets address list");
  for (const wallet of wallets) {
    if (!isAddress(wallet.address)) throw new Error(`Invalid wallet address: ${wallet.address}`);
  }
  for (const token of extraTokens) {
    if (!isAddress(token)) throw new Error(`Invalid token address: ${token}`);
  }

  const { assetsDir, network, rpcUrl, knownTokens } = resolveConfig(
    stringArg(args.network),
    stringArg(args["rpc-url"]),
    stringArg(args["assets-dir"]),
  );
  const warnings: string[] = [];
  const snapshotTime = new Date().toISOString();
  const blockHex = await rpc<string>(rpcUrl, "eth_blockNumber", []);
  const blockNumber = Number(BigInt(blockHex));
  const discoveredTokens = boolArg(args.discover) ? await discoverTokens(network, wallets, warnings, maxDiscovered) : [];
  const tokenList = uniqByAddress([
    ...knownTokens,
    ...extraTokens.map((address) => ({ address })),
    ...discoveredTokens,
  ]);
  const tokens = [];
  for (const token of tokenList) {
    tokens.push(await readTokenMetadata(rpcUrl, token, warnings));
  }

  const nativeAsset = {
    address: "native",
    symbol: network.nativeToken || "NATIVE",
    name: network.nativeToken || "Native Token",
    decimals: 18,
    isNative: true,
  };
  const totals = new Map<string, Omit<AssetTotal, "balance">>();
  const walletReports: WalletReport[] = [];

  function addTotal(asset: Omit<AssetBalance, "balance" | "balanceRaw">, raw: string, walletHadBalance: boolean): void {
    const key = asset.address.toLowerCase();
    const existing = totals.get(key) || { ...asset, balanceRaw: "0", walletsWithBalance: 0 };
    existing.balanceRaw = (BigInt(existing.balanceRaw) + BigInt(raw)).toString();
    if (walletHadBalance) existing.walletsWithBalance += 1;
    totals.set(key, existing);
  }

  for (const wallet of wallets) {
    const assets: AssetBalance[] = [];
    let nativeBalance: string | null = "0";
    try {
      const nativeRaw = decodeUint(await rpc<string>(rpcUrl, "eth_getBalance", [wallet.address, blockHex]));
      if (nativeRaw === null) throw new Error("empty native balance response");
      nativeBalance = formatAmount(nativeRaw, 18);
      addTotal(nativeAsset, nativeRaw, BigInt(nativeRaw) > 0n);
      assets.push({ ...nativeAsset, balanceRaw: nativeRaw, balance: nativeBalance });
    } catch (error) {
      warnings.push(`Native balance failed for ${wallet.address}: ${(error as Error).message}`);
    }

    for (const token of tokens) {
      try {
        const data = `0x${SELECTORS.balanceOf}${padAddress(wallet.address)}`;
        const balanceRaw = decodeUint(await ethCall(rpcUrl, token.address, data, blockHex));
        if (balanceRaw === null) throw new Error("empty balanceOf response");
        addTotal({ ...token, isNative: false }, balanceRaw, BigInt(balanceRaw) > 0n);
        if (boolArg(args["include-zero"]) || BigInt(balanceRaw) > 0n) {
          assets.push({
            ...token,
            isNative: false,
            balanceRaw,
            balance: formatAmount(balanceRaw, token.decimals),
          });
        }
      } catch (error) {
        warnings.push(`balanceOf failed for ${token.address} wallet ${wallet.address}: ${(error as Error).message}`);
      }
    }

    walletReports.push({
      label: wallet.label,
      address: wallet.address,
      explorerUrl: explorerAddressUrl(network, wallet.address),
      nativeBalance,
      activity: boolArg(args.activity) ? await readActivity(network, wallet, warnings) : null,
      assets,
    });
  }

  const totalsList: AssetTotal[] = Array.from(totals.values()).map((asset) => ({
    ...asset,
    balance: formatAmount(asset.balanceRaw, asset.decimals),
  }));
  const nativeRichest = [...walletReports].sort((a, b) => decimalToNumber(b.nativeBalance) - decimalToNumber(a.nativeBalance))[0];
  const activeWallets = walletReports.filter((wallet): wallet is WalletReport & { activity: ActivitySample } => Boolean(wallet.activity));
  const mostActive = activeWallets.length
    ? [...activeWallets].sort((a, b) => b.activity.sampledTransactions - a.activity.sampledTransactions)[0]
    : null;

  const report: Report = {
    network: network.name,
    chainId: network.chainId,
    rpcUrl,
    assetsDir,
    nativeSymbol: nativeAsset.symbol,
    blockNumber,
    snapshotTime,
    walletCount: wallets.length,
    tokenCount: tokens.length,
    discovery: {
      enabled: boolArg(args.discover),
      discoveredTokenCount: discoveredTokens.length,
    },
    totals: totalsList,
    rankings: {
      nativeRichest: nativeRichest
        ? {
            label: nativeRichest.label,
            address: nativeRichest.address,
            nativeBalance: nativeRichest.nativeBalance,
          }
        : null,
      mostActive: mostActive
        ? {
            label: mostActive.label,
            address: mostActive.address,
            sampledTransactions: mostActive.activity.sampledTransactions,
            gasSpentNative: mostActive.activity.gasSpentNative,
          }
        : null,
    },
    wallets: walletReports,
    warnings,
  };

  const output = renderReport(report, format, totalsOnly);
  if (savePath) {
    fs.writeFileSync(savePath, output.endsWith("\n") ? output : `${output}\n`, "utf8");
    console.log(`Saved ${format} report to ${savePath}`);
  } else {
    console.log(output);
  }
}

main().catch((error: unknown) => {
  const message = (error as Error).message;
  console.error(JSON.stringify({
    error: message,
    hint: message.includes("Missing --wallets")
      ? "Pass addresses or saved names with --wallets 0xWallet1,Name2. Save names with --add-wallet Name:0xWallet."
      : message.includes("Invalid wallet address") || message.includes("Invalid token address")
        ? "Addresses must be 0x plus 40 hexadecimal characters."
        : message.includes("Unknown wallet name")
          ? "Use --list-wallets to see saved names, or add one with --add-wallet Name:0xWallet."
          : "Run with --help for usage examples.",
  }, null, 2));
  process.exit(1);
});
