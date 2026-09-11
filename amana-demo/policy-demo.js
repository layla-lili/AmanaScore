import { Client, PrivateKey, AccountBalanceQuery } from "@hiero-ledger/sdk";
import dotenv from "dotenv";
import {
  SHARIA_CATEGORIES,
  evaluateShariaTransferDecision,
} from "./sharia-compliance-policy.js";

dotenv.config();

function formatDecision(label, transfers) {
  const decision = evaluateShariaTransferDecision(transfers, SHARIA_CATEGORIES);
  const symbol = decision.allowed ? "ALLOW" : "BLOCK";
  return [
    `[${symbol}] ${label}`,
    `recipient: ${decision.accountId}`,
    `category: ${decision.category}`,
    `reason: ${decision.reason}`,
  ].join("\n");
}

async function main() {
  console.log(
    formatDecision("Compliant transfer request", [
      { accountId: "0.0.compliant1", amount: 1 },
    ]),
  );
  console.log("");
  console.log(
    formatDecision("Non-compliant transfer request", [
      { accountId: "0.0.noncompliant1", amount: 1 },
    ]),
  );
  console.log("");
  console.log(
    formatDecision("Unknown account transfer request", [
      { accountId: "0.0.unknown", amount: 1 },
    ]),
  );
  console.log("");

  const accountId = process.env.ACCOUNT_ID;
  const privateKey = process.env.PRIVATE_KEY;

  if (!accountId || !privateKey) {
    console.log(
      "Skipping Hedera balance check because ACCOUNT_ID or PRIVATE_KEY is missing.",
    );
    return;
  }

  const client = Client.forTestnet().setOperator(
    accountId,
    PrivateKey.fromStringECDSA(privateKey),
  );
  const balance = await new AccountBalanceQuery()
    .setAccountId(accountId)
    .execute(client);
  console.log(`Hedera balance check: ${balance.hbars.toString()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
