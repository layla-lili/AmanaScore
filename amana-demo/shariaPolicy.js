import {
  Client,
  PrivateKey,
  TransferTransaction,
  Hbar,
  TopicMessageSubmitTransaction,
} from "@hiero-ledger/sdk";
import dotenv from "dotenv";

dotenv.config();

// Hardcoded lookup: map recipient account -> category
const LOOKUP = {
  // replace these with real testnet account IDs you control if desired
  "0.0.compliant1": "asset-backed",
  "0.0.noncompliant1": "interest-lending",
};

function getClient() {
  const accountId = process.env.ACCOUNT_ID;
  const privateKey = process.env.PRIVATE_KEY;
  if (!accountId || !privateKey)
    throw new Error("Missing ACCOUNT_ID or PRIVATE_KEY");
  return Client.forTestnet().setOperator(
    accountId,
    PrivateKey.fromStringECDSA(privateKey),
  );
}

async function logToHcs(client, topicId, message) {
  if (!topicId) {
    console.log("[HCS LOG - none configured]", message);
    return null;
  }
  try {
    const submit = new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message);
    const resp = await submit.execute(client);
    const receipt = await resp.getReceipt(client);
    return receipt;
  } catch (err) {
    console.error("Failed to submit HCS message:", err?.message || err);
    return null;
  }
}

export async function shariaTransfer(recipient, hbars = "1", options = {}) {
  const client = options.client || getClient();
  const topicId = options.hcsTopicId || process.env.HCS_TOPIC_ID;
  const perform = process.env.PERFORM_TRANSFERS === "true" || options.perform;

  const category = LOOKUP[recipient] || "unknown";
  const timestamp = new Date().toISOString();

  if (category === "interest-lending") {
    const reason =
      "Non-compliant: transaction involves an interest-bearing structure (riba)";
    const audit = {
      timestamp,
      recipient,
      category,
      decision: "rejected",
      reason,
    };
    await logToHcs(client, topicId, JSON.stringify(audit));
    return { allowed: false, reason, audit };
  }

  // allowed
  const reason = "Allowed";
  const audit = { timestamp, recipient, category, decision: "allowed", reason };
  await logToHcs(client, topicId, JSON.stringify(audit));

  if (!perform) {
    return { allowed: true, dryRun: true, reason, audit };
  }

  try {
    const tx = new TransferTransaction()
      .addHbarTransfer(process.env.ACCOUNT_ID, Hbar.fromString(`-${hbars}`))
      .addHbarTransfer(recipient, Hbar.fromString(hbars));

    const submit = await tx.execute(client);
    const receipt = await submit.getReceipt(client);
    return { allowed: true, receipt, audit };
  } catch (err) {
    return {
      allowed: false,
      reason: `transfer failed: ${err?.message || err}`,
      audit,
    };
  }
}

export function setLookup(obj) {
  Object.assign(LOOKUP, obj);
}

export default { shariaTransfer, setLookup };
