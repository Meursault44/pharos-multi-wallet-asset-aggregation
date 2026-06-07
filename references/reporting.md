# Multi-Wallet Asset Reporting

## Default Report Shape

Use a compact report when the user asks for a summary:

- Verdict line: total wallets scanned, network, snapshot block.
- Aggregate holdings table: asset, token address or native marker, total balance, wallets with nonzero balance.
- Per-wallet section: one row per wallet with nonzero balances grouped by asset.
- Ranking line: highest native balance by default; most active wallet when activity sampling is enabled.
- Explorer links: include per-wallet links when the selected network exposes an explorer URL.
- Warnings: failed RPC calls, invalid extras, metadata fallbacks, or missing token decimals.

## CSV Columns

Use these columns for CSV exports:

```text
network,block,wallet_label,wallet,asset_symbol,asset_name,token_address,balance_raw,balance,decimals,is_native,explorer_url
```

Use `native` as the token address for PHRS or PROS.

## Edge Cases

- If all token balances are zero, still show native balances and say ERC20 balances were zero for the scanned token list.
- If an ERC20 metadata call fails, keep the token in the report using the address as the symbol and `decimals=18` only as a formatting fallback. Mark the fallback in warnings.
- If an RPC call fails for one wallet or token, keep the rest of the report and include the failed wallet/token pair in warnings.
- If explorer discovery fails, continue with configured tokens and mark discovery warnings.
- If activity sampling fails, keep balance data and mark activity warnings.
- If the user wants USD value, ask for a trusted price source or provided prices. Do not invent prices from memory.

## Optional Modes

- `--discover`: Use explorer token-transfer data to find additional candidate ERC20 contracts, then verify balances with RPC `balanceOf`.
- `--max-discovered <n>`: Cap explorer-discovered token contracts; default to 20 to avoid noisy wallets slowing the report.
- `--activity`: Sample recent explorer transactions to estimate transaction count and gas spent. Treat it as a recent sample, not full lifetime history.
- `--include-zero`: Include zero ERC20 balances in per-wallet output for exhaustive exports.

## Safety

Do not use private keys. Do not send transactions. Do not recommend moving funds unless the user explicitly asks for operational next steps.
