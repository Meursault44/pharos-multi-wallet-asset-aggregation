# Pharos Multi-Wallet Asset Aggregation

Read-only TypeScript skill for aggregating native PHRS/PROS and ERC20 balances across multiple Pharos wallets.

## Features

- Aggregate native and ERC20 balances across many wallets.
- Support Pharos Atlantic testnet and Pharos mainnet.
- Accept wallet labels such as `Main:0x...`.
- Export human-readable, JSON, or CSV reports.
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
npm run aggregate -- --wallets 0xWallet1,0xWallet2 --network atlantic-testnet
```

With labels:

```bash
npm run aggregate -- --wallets Main:0xWallet1,Trading:0xWallet2
```

With JSON output:

```bash
npm run aggregate -- --wallets 0xWallet1,0xWallet2 --format json
```

With explorer-assisted discovery and activity sampling:

```bash
npm run aggregate -- --wallets 0xWallet1,0xWallet2 --discover --activity --max-discovered 10
```

## Config

The script uses `assets/networks.json` and `assets/tokens.json` by default. You can override this with:

```bash
npm run aggregate -- --wallets 0xWallet1 --assets-dir ../pharos-skill-engine/assets
```

## Development

```bash
npm run check
```

## Safety

This skill performs read-only JSON-RPC and explorer API calls. It does not request private keys, seed phrases, signatures, approvals, or transactions.
