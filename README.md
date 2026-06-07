# Pharos Multi-Wallet Asset Aggregation

Read-only TypeScript skill for aggregating native PHRS/PROS and ERC20 balances across multiple Pharos wallets.

## Features

- Aggregate native and ERC20 balances across many wallets.
- Support Pharos Atlantic testnet and Pharos mainnet.
- Accept wallet labels such as `Main:0x...`.
- Save wallet addresses under names with `--add-wallet Name:0x...`, list them with `--list-wallets`, reuse them with `--wallets Name`, and remove them with `--remove-wallet Name`.
- Export human-readable, JSON, or CSV reports.
- Print totals-only summaries for quick portfolio checks.
- Save reports directly with `--save`.
- Include snapshot block and ISO timestamp.
- Add explorer links and native-balance ranking.
- Optionally sample recent activity with `--activity`.
- Optionally discover recent ERC20 candidates with `--discover`.
- Never use private keys and never send transactions.

## Install

```bash
npm install
```

## Usage

```bash
npm run aggregate -- --wallets 0xWallet1,0xWallet2
```

With labels:

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

With JSON output:

```bash
npm run aggregate -- --wallets 0xWallet1,0xWallet2 --format json
```

Totals only:

```bash
npm run aggregate -- --wallets 0xWallet1,0xWallet2 --totals-only
```

CSV saved to a file:

```bash
npm run aggregate -- --wallets 0xWallet1,0xWallet2 --format csv --save report.csv
```

With explorer-assisted discovery and activity sampling:

```bash
npm run aggregate -- --wallets 0xWallet1,0xWallet2 --discover --activity --max-discovered 10
```

Full per-wallet output including zero balances:

```bash
npm run aggregate -- --wallets 0xWallet1,0xWallet2 --include-zero
```

Help:

```bash
npm run aggregate -- --help
```

## Config

The script uses `assets/networks.json` and `assets/tokens.json` by default. You can override this with:

```bash
npm run aggregate -- --wallets 0xWallet1 --assets-dir ../pharos-skill-engine/assets
```

Saved wallet names are stored in `assets/wallet-labels.json`. This file stores public addresses only; do not put private keys, seed phrases, or API secrets in it.

## Development

```bash
npm run check
```

## Safety

This skill performs read-only JSON-RPC and explorer API calls. It does not request private keys, seed phrases, signatures, approvals, or transactions.

Public wallet addresses can reveal balances and activity patterns. Be careful when combining multiple addresses in one report if those addresses should not be linked.
