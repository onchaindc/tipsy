import assert from "node:assert/strict";
import test, { describe } from "node:test";
import {
  ASPECT_RATIOS,
  OUTPUT_FORMATS,
  normalizeAspectRatio,
  normalizeOutputFormat,
  normalizePrompt,
  parseChallenge,
} from "../src/image.js";

const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

/** Mirrors the provider's live challenge shape (base64-free excerpt). */
const CHALLENGE = {
  x402Version: 2,
  error: "PAYMENT-SIGNATURE header is required",
  accepts: [
    {
      scheme: "exact",
      network: "eip155:8453",
      maxAmountRequired: "150000",
      amount: "150000",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      payTo: "0x10FF767043A1723E0BB5B9207bC37D3442cC9E4F",
      maxTimeoutSeconds: 300,
      extra: { name: "USD Coin", version: "2", decimals: 6, priceUsd: "$0.15" },
    },
  ],
};

describe("image input validation", () => {
  test("prompt is trimmed and length-bounded", () => {
    assert.equal(normalizePrompt("  neon album cover  "), "neon album cover");
    assert.throws(() => normalizePrompt("   "), /prompt is required/);
    assert.throws(() => normalizePrompt("x".repeat(2049)), /too long/);
    assert.equal(normalizePrompt("x".repeat(2048)).length, 2048);
  });

  test("aspectRatio accepts only provider-documented values, defaults to 1:1", () => {
    assert.equal(normalizeAspectRatio(undefined), "1:1");
    for (const ratio of ASPECT_RATIOS) assert.equal(normalizeAspectRatio(ratio), ratio);
    assert.throws(() => normalizeAspectRatio("2:1" as never), /provider-documented/);
    assert.throws(() => normalizeAspectRatio("" as never), /provider-documented/);
  });

  test("outputFormat accepts png/jpeg, defaults to png", () => {
    assert.equal(normalizeOutputFormat(undefined), "png");
    assert.equal(normalizeOutputFormat("PNG"), "png");
    assert.equal(normalizeOutputFormat("jpeg"), "jpeg");
    for (const format of OUTPUT_FORMATS) assert.equal(normalizeOutputFormat(format), format);
    assert.throws(() => normalizeOutputFormat("gif" as never), /provider-documented/);
  });
});

describe("x402 challenge parsing", () => {
  test("returns the live atomic amount and listed price", () => {
    assert.deepEqual(parseChallenge(CHALLENGE), { maxAmountRequired: "150000", priceUsd: "$0.15" });
  });

  test("rejects non-Base-USDC rails and malformed challenges", () => {
    assert.throws(() => parseChallenge({}), /no accepts entry/);
    assert.throws(() => parseChallenge({ accepts: [] }), /no accepts entry/);
    assert.throws(
      () => parseChallenge({ accepts: [{ network: "solana:mainnet", asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }] }),
      /unsupported payment asset/,
    );
    assert.throws(
      () => parseChallenge({ accepts: [{ network: "eip155:8453", asset: "0x9999999999999999999999999999999999999999" }] }),
      /unsupported payment asset/,
    );
    assert.throws(
      () => parseChallenge({ accepts: [{ network: "eip155:8453", asset: USDC }] }),
      /maxAmountRequired/,
    );
    assert.throws(
      () => parseChallenge({ accepts: [{ asset: USDC, maxAmountRequired: "0" }] }),
      /maxAmountRequired/,
    );
    assert.throws(
      () => parseChallenge({ accepts: [{ asset: USDC, maxAmountRequired: "-5" }] }),
      /maxAmountRequired/,
    );
  });

  test("falls back to the accept without a documented network and tolerates a missing price", () => {
    assert.deepEqual(
      parseChallenge({ accepts: [{ asset: USDC.toUpperCase(), maxAmountRequired: "150000" }] }),
      { maxAmountRequired: "150000", priceUsd: undefined },
    );
  });
});
