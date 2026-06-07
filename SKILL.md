---
name: pharos-multi-wallet-asset-aggregation
description: Aggregate native PHRS/PROS and ERC20 asset balances across multiple wallets on Pharos Atlantic testnet or Pharos mainnet. Use when a user asks to summarize holdings, compare balances, consolidate portfolio exposure, audit wallet assets, rank wallets, inspect cross-wallet activity, export balances, or build a multi-wallet asset report for Pharos addresses.
---

# Pharos Multi-Wallet Asset Aggregation

Use this skill to produce a read-only asset inventory across many Pharos wallets. Combine it with `pharos-skill-engine` for network config and token lists.

## Inputs

Ask for or infer:

- Wallet addresses: required, one or more `0x` plus 40 hex character addresses.
- Network: default to `mainnet`; support `atlantic-testnet`.
- Token universe: default to the known tokens in `pharos-skill-engine/assets/tokens.json`; allow extra ERC20 addresses when the user provides them.
- Output mode: default to a concise human report; use JSON or CSV when requested.
- Wallet labels: optional; accept `Main:0x...` and `Trading:0x...` labels.
- Saved wallet names: optional; resolve names from `assets/wallet-labels.json` when the user refers to wallets by name.

Never ask for private keys or seed phrases. This workflow uses read-only JSON-RPC calls only.

## Saved Wallet Names

Use the local address book when the user wants to save or reuse wallet names. The address book is `assets/wallet-labels.json` and stores public addresses only.

- Add or update a saved name: `npm run aggregate -- --add-wallet Main:0xWallet`
- List saved names: `npm run aggregate -- --list-wallets`
- Remove a saved name: `npm run aggregate -- --remove-wallet Main`
- Use saved names in reports: `npm run aggregate -- --wallets Main,Trading`

Map natural-language requests to these commands:

- "add wallet", "save wallet", "добавь кошелек", "сохрани кошелек" -> `--add-wallet Name:0xAddress`
- "list wallets", "saved wallets", "покажи кошельки" -> `--list-wallets`
- "remove wallet", "delete wallet", "удали кошелек" -> `--remove-wallet Name`
- If a user says `Main`, `Trading`, or another saved name in a wallet list, pass the name through `--wallets Main,Trading`.

## User Intent Mapping

Map natural-language requests to CLI options:

- "compare", "сравни", "где больше", "у кого больше" -> human report with per-wallet balances and native-balance ranking.
- "summary", "суммарно", "суммарные активы", "итого" -> add `--totals-only` unless the user also asks for per-wallet details.
- "CSV", "таблица", "экспорт" -> add `--format csv`; use `--save <file>` when the user asks to save a file.
- "JSON", "для скрипта", "machine-readable" -> add `--format json`.
- "все строки", "нулевые балансы", "полный отчет" -> add `--include-zero`.
- "найди токены", "discover", "все токены по истории" -> add `--discover`; cap with `--max-discovered` for noisy wallets.
- "активность", "транзакции", "gas spent" -> add `--activity`.

If the user does not specify a network, use `mainnet`. Use `atlantic-testnet` only when the user explicitly asks for testnet.

## Fast Path

Run the bundled aggregator first from the skill repository root:

```bash
npm run aggregate -- --wallets 0xWallet1,0xWallet2
```

With wallet labels:

```bash
npm run aggregate -- --wallets Main:0xWallet1,Trading:0xWallet2
```

Save wallet names for later:

```bash
npm run aggregate -- --add-wallet Main:0xWallet1
npm run aggregate -- --add-wallet Trading:0xWallet2
```

Use saved wallet names:

```bash
npm run aggregate -- --wallets Main,Trading
```

List or remove saved wallet names:

```bash
npm run aggregate -- --list-wallets
npm run aggregate -- --remove-wallet Trading
```

On Atlantic testnet:

```bash
npm run aggregate -- --wallets 0xWallet1,0xWallet2 --network atlantic-testnet
```

With extra ERC20 tokens:

```bash
npm run aggregate -- --wallets 0xWallet1,0xWallet2 --tokens 0xToken1,0xToken2 --network mainnet
```

With explorer-assisted token discovery and activity sampling:

```bash
npm run aggregate -- --wallets 0xWallet1,0xWallet2 --discover --activity
```

Limit explorer-discovered tokens when a wallet has noisy transfer history:

```bash
npm run aggregate -- --wallets 0xWallet1,0xWallet2 --discover --max-discovered 10
```

JSON output:

```bash
npm run aggregate -- --wallets 0xWallet1,0xWallet2 --format json
```

CSV output:

```bash
npm run aggregate -- --wallets 0xWallet1,0xWallet2 --format csv
```

Totals-only summary:

```bash
npm run aggregate -- --wallets 0xWallet1,0xWallet2 --totals-only
```

Save a CSV report:

```bash
npm run aggregate -- --wallets 0xWallet1,0xWallet2 --format csv --save report.csv
```

Show CLI help:

```bash
npm run aggregate -- --help
```

## Workflow

1. Validate wallet and token addresses before making RPC calls.
2. Resolve saved wallet names from `assets/wallet-labels.json` when names are used.
3. Resolve the selected network from `pharos-skill-engine/assets/networks.json`.
4. Load known tokens from `pharos-skill-engine/assets/tokens.json`.
5. Query each wallet's native balance with `eth_getBalance`.
6. Query each ERC20 with `balanceOf(wallet)`; use known decimals when available and read metadata for extra tokens.
7. Aggregate totals by asset and per wallet.
8. Add wallet explorer links when the network config provides an explorer URL.
9. Optionally discover extra token contracts from recent explorer token-transfer data with `--discover`; cap noisy discovery with `--max-discovered`.
10. Optionally sample recent activity and gas-fee data with `--activity`.
11. Highlight failures separately instead of silently dropping assets.
12. Report the snapshot block number and network so the user knows when the balances were observed.

Use `--assets-dir <path>` to point at a different Pharos `networks.json` and `tokens.json` directory. The script first checks local `assets/`, then sibling `pharos-skill-engine/assets`, then `.agents/skills/pharos-skill-engine/assets`.

Saved wallet names live in `assets/wallet-labels.json`. Store public wallet addresses only. Never store private keys, seed phrases, RPC secrets, or API keys there.

## Reporting

Return:

- Network, chain ID, snapshot block, and wallet count.
- Snapshot time in ISO-8601 UTC format.
- Aggregate totals by asset.
- Per-wallet balances for nonzero assets by default.
- Wallet ranking by native balance; activity ranking when `--activity` is enabled.
- Explorer links for each wallet when available.
- Zero-balance rows only when the user asks for exhaustive output.
- RPC or metadata errors as warnings.
- A short note that balances are a point-in-time read and do not include off-chain prices unless the user provided price data.

For report shaping, CSV conventions, and edge cases, read `references/reporting.md`.

## Good User Prompts

- `[$pharos-multi-wallet-asset-aggregation](SKILL.md) сравни кошельки 0x... и 0x...`
- `[$pharos-multi-wallet-asset-aggregation](SKILL.md) посмотри суммарные активы main:0x... и trading:0x...`
- `[$pharos-multi-wallet-asset-aggregation](SKILL.md) сделай CSV по этим адресам 0x..., 0x..., 0x...`
- `[$pharos-multi-wallet-asset-aggregation](SKILL.md) дай JSON totals-only по кошелькам 0x... и 0x...`
- `[$pharos-multi-wallet-asset-aggregation](SKILL.md) проверь эти адреса с discover и activity`
- `[$pharos-multi-wallet-asset-aggregation](SKILL.md) на atlantic-testnet покажи полный отчет с нулевыми балансами`

## Saved Name Prompt Examples

- `[$pharos-multi-wallet-asset-aggregation](SKILL.md) add wallet Main:0x...`
- `[$pharos-multi-wallet-asset-aggregation](SKILL.md) save wallet Trading:0x...`
- `[$pharos-multi-wallet-asset-aggregation](SKILL.md) compare Main and Trading`
- `[$pharos-multi-wallet-asset-aggregation](SKILL.md) show totals for Main, Trading, Vault`
- `[$pharos-multi-wallet-asset-aggregation](SKILL.md) list saved wallets`
- `[$pharos-multi-wallet-asset-aggregation](SKILL.md) remove wallet Trading`

## Privacy Note

Public wallet addresses can reveal balances and activity patterns, especially when multiple addresses are reported together. Keep the workflow read-only, never request secrets, and remind the user that linking addresses in a single report may reduce privacy.
