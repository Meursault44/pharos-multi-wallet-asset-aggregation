# Pharos Multi-Wallet Asset Aggregation

Read-only TypeScript skill for aggregating native PHRS/PROS and ERC20 balances across multiple Pharos wallets.

The skill follows the Pharos Skill Engine structure: `SKILL.md` routes intents through a Capability Index, while `references/aggregation.md` defines exact commands, parameters, output parsing, errors, and agent guidelines. It should be used together with the base `pharos-skill-engine` so network, RPC, explorer, and token assumptions stay consistent.

## Features

- Aggregate native and ERC20 balances across many wallets.
- Support Pharos Atlantic testnet and Pharos mainnet.
- Accept direct public wallet addresses only.
- Delegate reusable public wallet aliases to the separate `$pharos-wallet-address-book` skill. This aggregator does not load, store, add, rename, or remove aliases.
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

The default network is Pharos Atlantic testnet. Select mainnet explicitly:

```bash
npm run aggregate -- --wallets 0xWallet1,0xWallet2 --network mainnet
```

Saved aliases must be resolved before running the aggregator:

```text
$pharos-wallet-address-book resolves main -> 0x...
npm run aggregate -- --wallets 0xResolvedAddress
```

Passing `main`, `Main:0x...`, or `--wallet-book` directly to this skill is intentionally rejected with a hint to use `$pharos-wallet-address-book`.

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

Saved wallet aliases are intentionally not loaded or managed by this skill. Use `$pharos-wallet-address-book` to list or resolve aliases, then pass direct addresses to this aggregator.

## Network Behavior

- Default network is Pharos Atlantic testnet.
- Mainnet is used only when explicitly requested.
- Reads are point-in-time snapshots at one block.
- Configured token balances are read through RPC `balanceOf`.
- Explorer discovery and activity sampling are optional best-effort enrichments, not complete lifetime history.

## Development

```bash
npm run check
npm test
```

## Safety

This skill performs read-only JSON-RPC and explorer API calls. It does not request private keys, seed phrases, signatures, approvals, or transactions.

Public wallet addresses can reveal balances and activity patterns. Be careful when combining multiple addresses in one report if those addresses should not be linked.
