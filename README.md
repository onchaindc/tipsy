# Tipsy

A [PayBox](https://paybox.sh) plugin that lets an AI agent pay a creator in USDC on Base and commission artwork from Suede AI — with the human always in the approval loop.

## Tools

| Tool | What it does | Payment |
|---|---|---|
| `pay_creator` | Proposes a Base USDC (ERC-20) transfer to a recipient wallet, with an X @handle as a display label only | Real transfer, once approved |
| `create_creator_asset` | Proposes a paid x402 image-generation request to Suede AI's `app.suedeai.ai/agent/image` endpoint | Real x402 charge (price discovered live from the provider's challenge) |

Neither tool signs, sends, or confirms anything by itself. PayBox holds the wallets, validates each proposal against the payment rails, and requires the user's explicit approval before money moves.

## How it works

- `pay_creator` encodes a standard `transfer(address,uint256)` call to the Base USDC contract (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, 6 decimals) at a chain-neutral `eip155:8453` proposal. The tool never sees a private key.
- `create_creator_asset` makes a dry request to Suede AI, reading the live x402 challenge for the current `maxAmountRequired` — the cost is never hard-coded — then wraps it as a `chain: eip155:8453` proposal with a `usdc` output.
- Both return a `io.paybox/transactionProposal` payload structured per the PayBox starter protocol (v1.0.2, MCP protocol `2026-07-28`) — an unsigned proposal, a cost disclosure, and clear wording about what PayBox does next.

## Install

```bash
pnpm install
pnpm test
```

Requirements: Node.js 24, pnpm 11.

- `pnpm test` reproduces `dist/plugin.mjs` twice, verifies the byte-identical build, and runs the output through the PayBox starter conformance harness, including the sample call from `paybox-plugin.json`.
- `pnpm typecheck` — strict TypeScript, no emit.
- `pnpm test:unit` — unit tests for the pure validation and x402-challenge logic.
- `pnpm conformance` — a JSON conformance report on the current artifact.

## Structure

```
src/
  plugin.ts   — MCP server wiring and tool definitions
  validate.ts — handle, amount, and recipient normalization; transfer calldata
  image.ts    — prompt/aspect/format normalization, x402 challenge parsing
  paybox.ts   — PayBox proposal schemas and builders
scripts/      — starter conformance harness (unmodified starter code)
tests/        — unit tests for the pure logic
```

The plugin is a single-file artifact served over stdio: build it with `pnpm build`, or run `pnpm test` for the byte-identical rebuild plus the conformance audit in one step.

## Uploading to PayBox

Upload `dist/plugin.mjs` — or the byte-identical root `plugin.mjs` in this repo — in the [developer portal](https://developer.paybox.sh) under **Register with PayBox**. Then add the network host `app.suedeai.ai` under Test & configure before running the hosted checks.

The portal's Test console runs proposals in **simulation only**: no signing, no broadcast, no payment. Real payments happen only when the plugin is enabled and used through an agent, and the user approves each request in PayBox.
