import * as z from "zod/v4";
import { atomicAmount } from "./paybox.js";
import type { Address } from "viem";

// USDC on Base mainnet (eip155:8453), as published in the PayBox plugin requirements.
export const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
export const USDC_DECIMALS = 6;
export const CHAIN = "eip155:8453";

export const inputSchema = z
  .object({
    handle: z.string().min(1),
    recipient: z.string().min(1),
    amount: z.string().min(1),
    note: z.string().min(1).max(256).optional(),
  })
  .strict();

/**
 * X @handle is accepted with or without a leading "@". It is a display label
 * only: nothing here verifies that the recipient wallet actually belongs to
 * that X account (no handle-resolution mechanism exists in PayBox).
 */
export function normalizeHandle(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) throw new Error("handle is required.");
  if (trimmed.length > 64) throw new Error("handle is too long (max 64 characters, including an optional leading '@').");
  const handle = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  if (!/^[A-Za-z0-9_]{4,15}$/.test(handle)) {
    throw new Error(
      "handle must be a valid X username: 4-15 characters, letters/digits/underscores only (with or without a leading '@').",
    );
  }
  return handle;
}

/**
 * Exact integer conversion: "1.25" USDC -> "1250000" atomic units via the
 * starter's atomicAmount (string math only, no floating point).
 */
export function normalizeAmount(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) throw new Error("amount is required.");
  if (!/^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(trimmed)) {
    throw new Error('amount must be a plain decimal string like "1.25" (no currency symbols, commas, or exponent notation).');
  }
  let atomic: string;
  try {
    atomic = atomicAmount(trimmed, USDC_DECIMALS);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`amount invalid for USDC (${USDC_DECIMALS} decimals): ${message}`);
  }
  if (atomic === "0") throw new Error("amount must be greater than zero.");
  return atomic;
}

/**
 * Recipient must be syntactically valid (0x + 40 hex chars, any case, matching
 * the pattern documented in the starter's base-transfer example); ownership is
 * assumed, never verified.
 */
export function validateRecipient(raw: string): Address {
  const trimmed = raw.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    throw new Error("recipient must be a valid EVM wallet address: 0x followed by 40 hexadecimal characters (Base mainnet).");
  }
  return trimmed as Address;
}
