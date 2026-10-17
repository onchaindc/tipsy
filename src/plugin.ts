import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { encodeFunctionData, erc20Abi } from "viem";
import * as z from "zod/v4";
import { evmOutputSchema, proposeEvm, x402OutputSchema } from "./paybox.js";
import {
  CHAIN,
  USDC_BASE,
  inputSchema,
  normalizeAmount,
  normalizeHandle,
  validateRecipient,
} from "./validate.js";
import {
  IMAGE_ENDPOINT,
  proposePaidImage,
  normalizeAspectRatio,
  normalizeOutputFormat,
  normalizePrompt,
} from "./image.js";

const key = "io.paybox/transactionProposal";

function createServer() {
  const server = new McpServer(
    { name: "tipsy", version: "0.1.0" },
    { supportedProtocolVersions: ["2026-07-28"] },
  );

  server.registerTool(
    "pay_creator",
    {
      title: "Pay a creator on Base (USDC)",
      description:
        "Prepares an unsigned Base USDC (6-decimal ERC-20) transfer to the recipient wallet you specify, with the X @handle recorded as a display label only. The @handle does not verify wallet ownership. PayBox selects the wallet, simulates the transaction, and requires user approval before signing or sending; this tool does not sign, broadcast, or confirm anything.",
      inputSchema,
      outputSchema: evmOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ handle, recipient, amount, note }) => {
      const normalizedHandle = normalizeHandle(handle);
      const validatedRecipient = validateRecipient(recipient);
      const atomic = normalizeAmount(amount);

      // Standard ERC-20 transfer call: selector transfer(address,uint256) with
      // the Base USDC contract as `to`, value 0. PayBox builds, simulates, and
      // obtains approval for this call; the tool only encodes the calldata.
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [validatedRecipient, BigInt(atomic)],
      });

      const proposal = proposeEvm({
        chain: CHAIN,
        to: USDC_BASE,
        value: "0",
        data,
      });

      const noteText = note === undefined ? "" : ` Note: "${note}"`;
      return {
        content: [
          {
            type: "text",
            text:
              `Proposed an unsigned transfer of ${amount} USDC (${atomic} atomic units) on Base to @${normalizedHandle}'s recipient wallet ${validatedRecipient}.${noteText}` +
              ` The @handle is a display label only and does not verify that this wallet belongs to that X account.` +
              ` PayBox must validate the proposal and obtain approval before signing or sending anything.`,
          },
        ],
        structuredContent: proposal.structuredContent as { [key]: unknown },
      };
    },
  );

  server.registerTool(
    "create_creator_asset",
    {
      title: "Commission artwork from Suede AI",
      description:
        "Proposes a paid x402 image-generation request to the PayBox service catalogue endpoint " +
        IMAGE_ENDPOINT +
        " (Base USDC; the exact price is discovered live from the provider's challenge at call time). " +
        "PayBox checks the proposal against the live challenge, then the user reviews approval, and PayBox pays with an eligible wallet before retrying the endpoint. " +
        "The service is asynchronous: the paid request returns a jobId and a pollUrl, and PayBox surfaces that terminal response including any image URL when available. " +
        "This tool never claims an image was generated; it only proposes the paid request.",
      inputSchema: z
        .object({
          prompt: z.string().min(1),
          aspectRatio: z.string().optional(),
          outputFormat: z.string().optional(),
        })
        .strict(),
      outputSchema: x402OutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ prompt, aspectRatio, outputFormat }) => {
      const cleanPrompt = normalizePrompt(prompt);
      const ratio = normalizeAspectRatio(aspectRatio);
      const format = normalizeOutputFormat(outputFormat);
      const { proposal, priceUsd, maxAmountRequired } = await proposePaidImage({
        prompt: cleanPrompt,
        aspectRatio: ratio,
        outputFormat: format,
      });
      const cost = priceUsd ? ` the provider lists it as ${priceUsd}` : ` that is ${maxAmountRequired} atomic USDC`;
      return {
        content: [
          {
            type: "text",
            text:
              `Proposed a paid image generation on Base USDC${cost}. PayBox must validate the proposal against the provider's live challenge, obtain approval, and pay before the request is retried; nothing has been paid or generated yet.` +
              ` The service is asynchronous: the paid response returns a jobId and a pollUrl that needs no further payment, and the finished imageUrl comes through the PayBox request result when the provider completes it.` +
              ` No image exists yet; do not treat this proposal as a receipt.`,
          },
        ],
        structuredContent: proposal.structuredContent as { [key]: unknown },
      };
    },
  );

  return server;
}

serveStdio(createServer, { legacy: "reject" });
