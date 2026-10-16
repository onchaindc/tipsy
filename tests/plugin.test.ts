import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { encodeFunctionData, erc20Abi } from "viem";
import {
  CHAIN,
  USDC_BASE,
  USDC_DECIMALS,
  normalizeAmount,
  normalizeHandle,
  validateRecipient,
} from "../src/validate.js";

describe("normalizeHandle", () => {
  test("strips a leading @ and passes valid handles", () => {
    assert.equal(normalizeHandle("paybox"), "paybox");
    assert.equal(normalizeHandle("@paybox"), "paybox");
    assert.equal(normalizeHandle(" user_42 "), "user_42");
    assert.equal(normalizeHandle("abcd"), "abcd");
    assert.equal(normalizeHandle("abcdefghijklmno"), "abcdefghijklmno");
  });

  test("rejects invalid handles with clear errors", () => {
    assert.throws(() => normalizeHandle("ab"), /4-15 characters/);
    assert.throws(() => normalizeHandle("abcdefghijklmnop"), /4-15 characters/);
    assert.throws(() => normalizeHandle("has space"), /4-15 characters/);
    assert.throws(() => normalizeHandle("a-b_-x"), /4-15 characters/);
    assert.throws(() => normalizeHandle("@a-b"), /4-15 characters/);
    assert.throws(() => normalizeHandle("  "), /required/);
    assert.throws(() => normalizeHandle(""), /required/);
  });
});

describe("normalizeAmount", () => {
  test("converts exact USDC amounts to atomic units", () => {
    assert.equal(normalizeAmount("0.05"), "50000");
    assert.equal(normalizeAmount("1.25"), "1250000");
    assert.equal(normalizeAmount("1"), "1000000");
    assert.equal(normalizeAmount("0.000001"), "1");
    assert.equal(normalizeAmount("42"), "42000000");
    assert.equal(normalizeAmount("0.123456"), "123456");
  });

  test("rejects zero, negative, and malformed amounts", () => {
    assert.throws(() => normalizeAmount("0"), /greater than zero/);
    assert.throws(() => normalizeAmount("0.000000"), /greater than zero/);
    assert.throws(() => normalizeAmount("-1"), /plain decimal string/);
    assert.throws(() => normalizeAmount("1 USD"), /plain decimal string/);
    assert.throws(() => normalizeAmount("1,000"), /plain decimal string/);
    assert.throws(() => normalizeAmount("1e3"), /plain decimal string/);
    assert.throws(() => normalizeAmount(".5"), /plain decimal string/);
    assert.throws(() => normalizeAmount("0.1234567"), /decimal places/);
    assert.throws(() => normalizeAmount("   "), /required/);
    assert.throws(() => normalizeAmount(""), /required/);
  });
});

describe("validateRecipient", () => {
  test("accepts valid 40-hex addresses in any case", () => {
    const addr = "0x1111111111111111111111111111111111111111";
    assert.equal(validateRecipient(addr), addr);
    assert.equal(
      validateRecipient("0xABCDEF0123456789ABCDEF0123456789ABCDEF01"),
      "0xABCDEF0123456789ABCDEF0123456789ABCDEF01",
    );
  });

  test("rejects malformed addresses", () => {
    for (const bad of ["", "0x", "1111111111111111111111111111111111111111", "0x1111", "0xGGGG111111111111111111111111111111111111"]) {
      assert.throws(() => validateRecipient(bad), /valid EVM wallet address/);
    }
  });
});

describe("transfer calldata", () => {
  test("encodes an ERC-20 transfer to the Base USDC contract with exact atomic units", () => {
    const atomic = normalizeAmount("0.05");
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [validateRecipient("0x1111111111111111111111111111111111111111"), BigInt(atomic)],
    });
    assert.equal(data.slice(0, 10), "0xa9059cbb"); // transfer(address,uint256) selector
    assert.equal(data.length, 2 + 8 + 64 * 2);
  });

  test("exports the documented token and chain details", () => {
    assert.equal(CHAIN, "eip155:8453");
    assert.equal(USDC_BASE.toLowerCase(), "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
    assert.equal(USDC_DECIMALS, 6);
  });
});
