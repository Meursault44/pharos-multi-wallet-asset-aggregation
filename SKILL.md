---
name: pharos-multi-wallet-asset-aggregation
description: Aggregate native PHRS/PROS and ERC20 balances across multiple wallets on Pharos Atlantic testnet or Pharos mainnet. Use for portfolio summaries, wallet comparisons, asset audits, balance exports, wallet rankings, token discovery, and read-only cross-wallet activity reports. Resolve saved wallet aliases with $pharos-wallet-address-book before running this skill.
---

# Pharos Multi-Wallet Asset Aggregation

Produce read-only, point-in-time asset reports across multiple Pharos wallets. Always use this skill together with `pharos-skill-engine` so network IDs, RPC URLs, explorers, and token addresses come from the canonical Pharos configuration.

Never request or store private keys, seed phrases, signatures, approvals, or transaction credentials.

## Capability Index

| User intent and synonyms | Capability | Instructions |
|---|---|---|
| aggregate balances, summarize holdings, portfolio total, суммарные активы, итого | Aggregate wallet assets | [Aggregate Wallet Assets](references/aggregation.md#aggregate-wallet-assets) |
| compare wallets, rank wallets, где больше, сравни кошельки | Compare and rank wallets | [Compare And Rank Wallets](references/aggregation.md#compare-and-rank-wallets) |
| export CSV, JSON report, таблица, машинный формат | Export reports | [Export Reports](references/aggregation.md#export-reports) |
| discover tokens, найти токены, scan transfer history | Discover ERC20 candidates | [Discover ERC20 Candidates](references/aggregation.md#discover-erc20-candidates) |
| activity, transactions, gas spent, активность | Sample wallet activity | [Sample Wallet Activity](references/aggregation.md#sample-wallet-activity) |
| output shape, warnings, zero balances, edge cases | Format the final answer | [Reporting Guide](references/reporting.md#multi-wallet-asset-reporting) |

## Routing Rules

1. Default to `atlantic-testnet`. Use `mainnet` only when the user explicitly requests mainnet or PROS.
2. Require at least one valid public EVM address. If the user gives a saved alias, resolve it with `$pharos-wallet-address-book` first and pass the direct address here.
3. Use configured tokens by default. Add `--tokens` only for token contracts supplied by the user.
4. Use `--totals-only` for aggregate-only requests, `--format json` for machine-readable output, and `--format csv --save <path>` for file exports.
5. Use `--discover` only when the user asks for broader token discovery. Explorer discovery is best-effort and RPC `balanceOf` remains the source of balance truth.
6. Use `--activity` only when requested. Describe it as a recent explorer sample, not complete lifetime history.
7. Report partial RPC or metadata failures as warnings. Never silently claim a complete scan after partial failures.
8. State the network, chain ID, snapshot block, and timestamp in the result.
9. Use `$pharos-wallet-address-book` for all alias list/resolve/add/rename/remove operations. This skill must never load, add, rename, or remove aliases itself.

## Fast Path

From this skill repository:

```bash
npm run aggregate -- --wallets 0xWallet1,0xWallet2
```

Mainnet must be explicit:

```bash
npm run aggregate -- --wallets 0xWallet1,0xWallet2 --network mainnet
```

For the complete command contract, parameters, output parsing, exact errors, and agent guidelines, read [references/aggregation.md](references/aggregation.md).

## Privacy

Public addresses can reveal ownership relationships when combined in one report. Mention this when the user aggregates addresses that may not be intended to be publicly linked.
