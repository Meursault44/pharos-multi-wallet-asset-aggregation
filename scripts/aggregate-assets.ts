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

type CliArgs = Record<string, string | boolean>;

type WalletSpec = {
  label: string | null;
  address: string;
};

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

function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function parseWalletSpecs(value: string | undefined): WalletSpec[] {
  if (!value) return [];
  const specs: WalletSpec[] = [];
  const matches = value.matchAll(/(?:^|[\s,;\n])(?:([A-Za-z0-9_.-]{1,40})\s*:\s*)?(0x[a-fA-F0-9]{40})/g);
  for (const match of matches) {
    specs.push({ label: match[1] || null, address: match[2] });
  }
  if (specs.length > 0) return specs;
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((address) => ({ label: null, address }));
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
  const selected = networkName || networks.defaultNetwork || "atlantic-testnet";
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

function toCsv(report: Report): string {
  const rows: Array<Array<string | number | boolean | null>> = [
    [
      "network",
      "block",
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

function toHuman(report: Report): string {
  const lines: string[] = [];
  lines.push("PHAROS MULTI-WALLET ASSET AGGREGATION");
  lines.push(`Network: ${report.network} (chain ${report.chainId || "unknown"})`);
  lines.push(`Snapshot block: ${report.blockNumber}`);
  lines.push(`Wallets: ${report.walletCount} | ERC20 tokens scanned: ${report.tokenCount}`);
  if (report.discovery.enabled) lines.push(`Discovery: ${report.discovery.discoveredTokenCount} extra token(s) from explorer transfers`);
  lines.push("");
  lines.push("Aggregate holdings:");
  for (const asset of report.totals) {
    lines.push(`- ${asset.symbol}: ${asset.balance} (${asset.walletsWithBalance}/${report.walletCount} wallets)`);
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const wallets = parseWalletSpecs(stringArg(args.wallets) || stringArg(args.wallet));
  const extraTokens = splitAddresses(stringArg(args.tokens) || stringArg(args.token));
  const format = stringArg(args.format) || "human";
  const maxDiscovered = Number.isFinite(Number(args["max-discovered"])) ? Number(args["max-discovered"]) : 20;

  if (wallets.length === 0) throw new Error("Missing --wallets address list");
  for (const wallet of wallets) {
    if (!isAddress(wallet.address)) throw new Error(`Invalid wallet address: ${wallet.address}`);
  }
  for (const token of extraTokens) {
    if (!isAddress(token)) throw new Error(`Invalid token address: ${token}`);
  }

  const { assetsDir, network, rpcUrl, knownTokens } = resolveConfig(
    stringArg(args.network) || "atlantic-testnet",
    stringArg(args["rpc-url"]),
    stringArg(args["assets-dir"]),
  );
  const warnings: string[] = [];
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

  if (format === "csv") console.log(toCsv(report));
  else if (format === "json") console.log(JSON.stringify(report, null, 2));
  else console.log(toHuman(report));
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ error: (error as Error).message }, null, 2));
  process.exit(1);
});
