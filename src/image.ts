import { proposeX402 } from "./paybox.js";
import { USDC_BASE } from "./validate.js";

/**
 * Image-generation service endpoint from the PayBox service catalogue.
 * Owner-updatable without a new code version via the non-sensitive
 * environment variable IMAGE_ENDPOINT_URL.
 */
export const IMAGE_ENDPOINT =
  process.env.IMAGE_ENDPOINT_URL ?? "https://app.suedeai.ai/agent/image";

/** Aspect ratios documented by the provider's published x402 challenge schema. */
export const ASPECT_RATIOS = [
  "1:1", "9:16", "16:9", "3:4", "4:3", "3:2", "2:3", "5:4", "4:5", "21:9",
] as const;

/** Output formats documented by the provider's published x402 challenge schema. */
export const OUTPUT_FORMATS = ["png", "jpeg"] as const;

export type AspectRatio = (typeof ASPECT_RATIOS)[number];
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

const CHALLENGE_TIMEOUT_MS = 4000;

export function normalizePrompt(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) throw new Error("prompt is required (a creative brief describing the image).");
  if (trimmed.length > 2048) throw new Error("prompt is too long (max 2048 characters).");
  return trimmed;
}

export function normalizeAspectRatio(raw: string | undefined): AspectRatio {
  if (raw === undefined) return "1:1";
  const value = raw.trim();
  if (!(ASPECT_RATIOS as readonly string[]).includes(value)) {
    throw new Error(`aspectRatio must be one of the provider-documented values: ${ASPECT_RATIOS.join(", ")}.`);
  }
  return value as AspectRatio;
}

export function normalizeOutputFormat(raw: string | undefined): OutputFormat {
  if (raw === undefined) return "png";
  const value = raw.trim().toLowerCase();
  if (!(OUTPUT_FORMATS as readonly string[]).includes(value)) {
    throw new Error(`outputFormat must be one of the provider-documented values: ${OUTPUT_FORMATS.join(", ")}.`);
  }
  return value as OutputFormat;
}

export interface ImageChallenge {
  maxAmountRequired: string;
  priceUsd?: string;
}

/**
 * Parse the live x402 challenge into an exact atomic-USDC maxAmount. Only the
 * documented Base USDC rail is accepted; anything else is rejected with a
 * clear error. The returned amount is used verbatim — quotes are never
 * hard-coded in the plugin.
 */
export function parseChallenge(payload: unknown): ImageChallenge {
  const accepts = (payload as { accepts?: unknown } | null)?.accepts;
  if (!Array.isArray(accepts) || accepts.length === 0) {
    throw new Error("The image service did not return a usable x402 payment challenge (no accepts entry).");
  }
  const accept = (accepts.find((a) => (a as { network?: string })?.network === "eip155:8453") ??
    accepts[0]) as Record<string, unknown>;
  const asset = typeof accept.asset === "string" ? accept.asset : "";
  if (asset.toLowerCase() !== USDC_BASE.toLowerCase()) {
    throw new Error(
      `The image service requested an unsupported payment asset (${asset || "missing"}); only Base USDC ${USDC_BASE} is supported.`,
    );
  }
  const max = (accept.maxAmountRequired ?? accept.amount) as unknown;
  if (typeof max !== "string" || !/^[1-9][0-9]{0,19}$/.test(max)) {
    throw new Error("The image service challenge did not include a valid maxAmountRequired (atomic USDC).");
  }
  const extra = accept.extra as { priceUsd?: unknown } | undefined;
  const priceUsd = typeof extra?.priceUsd === "string" && extra.priceUsd.trim().length > 0
    ? extra.priceUsd.trim()
    : undefined;
  return { maxAmountRequired: max, priceUsd };
}

/** Fetch the live 402 challenge (bounded; cost discovery only, no payment). */
export async function fetchChallenge(
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = CHALLENGE_TIMEOUT_MS,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(IMAGE_ENDPOINT, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (response.status !== 402 && !response.ok) {
      throw new Error(`Could not discover the image service payment requirements (HTTP ${response.status}).`);
    }
    try {
      return (await response.json()) as unknown;
    } catch {
      throw new Error("The image service returned a payment challenge that is not valid JSON.");
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Timed out discovering the image service payment requirements; try again.");
    }
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch the live challenge, validate the documented rail/asset/amount, and
 * propose the paid POST through PayBox's x402 flow. PayBox re-verifies the
 * proposal against the same live challenge before seeking approval.
 */
export interface PaidImageProposal {
  proposal: { content: unknown[]; structuredContent: Record<string, unknown> };
  priceUsd?: string;
  maxAmountRequired: string;
}

export async function proposePaidImage(
  input: { prompt: string; aspectRatio: AspectRatio; outputFormat: OutputFormat },
): Promise<PaidImageProposal> {
  const { maxAmountRequired, priceUsd } = parseChallenge(await fetchChallenge());
  const proposal = proposeX402({
    chain: "eip155:8453",
    url: new URL(IMAGE_ENDPOINT).toString(),
    method: "POST",
    body: {
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      outputFormat: input.outputFormat,
    },
    maxAmount: maxAmountRequired,
  });
  return { proposal, priceUsd, maxAmountRequired };
}
