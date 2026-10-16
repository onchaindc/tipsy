import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { encodeFunctionData, erc20Abi } from "viem";
import { evmOutputSchema, proposeEvm } from "./paybox.js";
import {
  CHAIN,
  USDC_BASE,
  inputSchema,
  normalizeAmount,
  normalizeHandle,
  validateRecipient,
} from "./validate.js";

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

  return server;
}

serveStdio(createServer, { legacy: "reject" });
