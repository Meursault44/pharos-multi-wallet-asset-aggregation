---
name: pharos-multi-wallet-asset-aggregation
description: Aggregate native PHRS/PROS and ERC20 asset balances across multiple wallets on Pharos Atlantic testnet or Pharos mainnet. Use when a user asks to summarize holdings, compare balances, consolidate portfolio exposure, audit wallet assets, rank wallets, inspect cross-wallet activity, export balances, or build a multi-wallet asset report for Pharos addresses.
---

# Pharos Multi-Wallet Asset Aggregation

Use this skill to produce a read-only asset inventory across many Pharos wallets. Combine it with `pharos-skill-engine` for network config and token lists.

## Inputs

Ask for or infer:

- Wallet addresses: required, one or more `0x` plus 40 hex character addresses.
- Network: default to `atlantic-testnet`; support `mainnet`.
- Token universe: default to the known tokens in `pharos-skill-engine/assets/tokens.json`; allow extra ERC20 addresses when the user provides them.
- Output mode: default to a concise human report; use JSON or CSV when requested.
- Wallet labels: optional; accept `Main:0x...` and `Trading:0x...` labels.

Never ask for private keys or seed phrases. This workflow uses read-only JSON-RPC calls only.

## Fast Path

Run the bundled aggregator first from the skill repository root:

```bash
npm run aggregate -- --wallets 0xWallet1,0xWallet2 --network atlantic-testnet
```

With wallet labels:

```bash
npm run aggregate -- --wallets Main:0xWallet1,Trading:0xWallet2
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

## Workflow

1. Validate wallet and token addresses before making RPC calls.
2. Resolve the selected network from `pharos-skill-engine/assets/networks.json`.
3. Load known tokens from `pharos-skill-engine/assets/tokens.json`.
4. Query each wallet's native balance with `eth_getBalance`.
5. Query each ERC20 with `balanceOf(wallet)`; use known decimals when available and read metadata for extra tokens.
6. Aggregate totals by asset and per wallet.
7. Add wallet explorer links when the network config provides an explorer URL.
8. Optionally discover extra token contracts from recent explorer token-transfer data with `--discover`; cap noisy discovery with `--max-discovered`.
9. Optionally sample recent activity and gas-fee data with `--activity`.
10. Highlight failures separately instead of silently dropping assets.
11. Report the snapshot block number and network so the user knows when the balances were observed.

Use `--assets-dir <path>` to point at a different Pharos `networks.json` and `tokens.json` directory. The script first checks local `assets/`, then sibling `pharos-skill-engine/assets`, then `.agents/skills/pharos-skill-engine/assets`.

## Reporting

Return:

- Network, chain ID, snapshot block, and wallet count.
- Aggregate totals by asset.
- Per-wallet balances for nonzero assets by default.
- Wallet ranking by native balance; activity ranking when `--activity` is enabled.
- Explorer links for each wallet when available.
- Zero-balance rows only when the user asks for exhaustive output.
- RPC or metadata errors as warnings.
- A short note that balances are a point-in-time read and do not include off-chain prices unless the user provided price data.

For report shaping, CSV conventions, and edge cases, read `references/reporting.md`.
