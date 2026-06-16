# Pharos Multi-Wallet Asset Aggregation Reference

## Aggregate Wallet Assets

### Overview

Read native PHRS/PROS and configured ERC20 balances at one block, then return per-wallet balances and cross-wallet totals. This capability is read-only.

### Command Template

```bash
npm run aggregate -- --wallets <wallets> [--network <network>] [--tokens <tokens>] [--format <format>] [--totals-only] [--include-zero] [--save <path>] [--assets-dir <path>] [--rpc-url <url>]
```

Example:

```bash
npm run aggregate -- --wallets 0x1111111111111111111111111111111111111111,0x2222222222222222222222222222222222222222 --network atlantic-testnet
```

### Parameters

| Parameter | Required | Default | Description |
|---|---:|---|---|
| `--wallets <list>` | Yes | None | Comma-, space-, or semicolon-separated public wallet addresses. Resolve aliases with `$pharos-wallet-address-book` first. |
| `--network <name>` | No | `atlantic-testnet` | `atlantic-testnet` or `mainnet`. Mainnet must be explicit. |
| `--tokens <list>` | No | Configured network tokens | Additional ERC20 contract addresses. |
| `--format <mode>` | No | `human` | `human`, `json`, or `csv`. |
| `--totals-only` | No | `false` | Omit per-wallet details and return aggregate totals. |
| `--include-zero` | No | `false` | Include zero ERC20 balances in per-wallet output. |
| `--save <path>` | No | stdout | Write the rendered report to a file. |
| `--assets-dir <path>` | No | Auto-detected | Override the directory containing `networks.json` and `tokens.json`. |
| `--rpc-url <url>` | No | Network config | Override the selected network RPC URL. |

### Output Parsing

| Field | Meaning | Agent behavior |
|---|---|---|
| `network`, `chainId` | Network identity | Verify it matches the user's request before presenting results. |
| `blockNumber`, `snapshotTime` | Point-in-time snapshot | Always include these in a report or summary. |
| `walletCount`, `tokenCount` | Scan scope | Use to describe how broad the scan was. |
| `totals[]` | Aggregated asset balances | Present totals without combining unrelated token contracts. |
| `wallets[]` | Per-wallet balances | Omit only for totals-only requests. |
| `warnings[]` | Partial failures or fallbacks | Surface relevant warnings; do not call the scan complete when warnings show missing reads. |

## Compare And Rank Wallets

### Overview

Run the normal aggregation command in human or JSON mode. The report ranks wallets by native balance and, when activity sampling is enabled, by sampled transaction count.

### Command Template

```bash
npm run aggregate -- --wallets <wallets> --format json [--activity]
```

### Output Parsing

Use `rankings.nativeRichest` for native-token comparisons and `rankings.mostActive` only when `--activity` was requested. Do not infer USD value or total portfolio value without an explicit trusted price source.

## Export Reports

### Overview

Render deterministic JSON or CSV for downstream tools.

### Command Templates

```bash
npm run aggregate -- --wallets <wallets> --format json --save <report.json>
npm run aggregate -- --wallets <wallets> --format csv --save <report.csv>
npm run aggregate -- --wallets <wallets> --totals-only --format csv --save <totals.csv>
```

### Output Parsing

When `--save` is used, stdout confirms the saved path. The report content is written to that path. CSV column definitions are in [reporting.md](reporting.md#csv-columns).

## Discover ERC20 Candidates

### Overview

Use explorer transfer history to collect candidate token contracts, then verify balances through read-only RPC `balanceOf` calls.

### Command Template

```bash
npm run aggregate -- --wallets <wallets> --discover [--max-discovered <count>]
```

### Parameters

| Parameter | Required | Default | Description |
|---|---:|---|---|
| `--discover` | Yes | `false` | Enables explorer-assisted candidate discovery. |
| `--max-discovered <count>` | No | `20` | Limits discovered token contracts. |

### Output Parsing

Read `discovery.enabled` and `discovery.discoveredTokenCount`. Explorer failure produces warnings and the configured-token scan continues.

## Sample Wallet Activity

### Overview

Sample recent explorer transactions and reported fees. This is not a full-history index.

### Command Template

```bash
npm run aggregate -- --wallets <wallets> --activity
```

### Output Parsing

Use `wallets[].activity.sampledTransactions` and `gasSpentNative`. Describe both as sampled values.

## Error Handling

CLI failures are emitted to stderr as JSON and exit with code `1`.

| Error code | Meaning | Agent response |
|---|---|---|
| `MISSING_WALLETS` | No wallet list was supplied. | Ask for one or more direct public addresses. |
| `INVALID_WALLET_ADDRESS` | A wallet is not `0x` plus 40 hexadecimal characters. | Ask the user to correct the public address. |
| `INVALID_TOKEN_ADDRESS` | An extra token contract is malformed. | Ask for a valid ERC20 contract address. |
| `WALLET_ALIAS_UNSUPPORTED` | A saved alias, inline label, or `--wallet-book` was passed directly to this skill. | Use `$pharos-wallet-address-book` to list or resolve aliases, then rerun with direct addresses. |
| `UNSUPPORTED_NETWORK` | The network name is not configured. | Use `atlantic-testnet` or `mainnet`. |
| `UNSUPPORTED_FORMAT` | Output mode is invalid. | Use `human`, `json`, or `csv`. |
| `ASSETS_NOT_FOUND` | Network/token assets could not be found. | Check installation or pass `--assets-dir`. |
| `RPC_ERROR` | RPC transport or JSON-RPC request failed. | Retry once, verify network/RPC, then report the failure. |
| `INTERNAL_ERROR` | Unexpected local failure. | Preserve the message and avoid inventing results. |

Warnings inside a successful report are partial failures, not fatal CLI errors.

## Agent Guidelines

1. Load `pharos-skill-engine` before selecting a network or interpreting PHRS/PROS.
2. Default to Pharos Atlantic testnet. Use mainnet only when the user explicitly requests mainnet or PROS.
3. Treat all wallet inputs as public addresses only; never request private keys or seed phrases.
4. Validate addresses locally before RPC calls.
5. Use the reported snapshot block for all balance reads in one run.
6. Treat configured token addresses and RPC `balanceOf` results as authoritative for this report.
7. Describe explorer token discovery and activity as best-effort enrichment.
8. Preserve partial results and surface warnings when individual token or wallet reads fail.
9. Never invent prices, USD values, token metadata, or balances.
10. Never send a transaction, approval, signature request, or asset movement from this skill.
11. Never load or mutate wallet aliases in this skill; delegate add, list, resolve, rename, and remove operations to `$pharos-wallet-address-book`.
