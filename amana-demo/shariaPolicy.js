import {
  Client,
  PrivateKey,
  TransferTransaction,
  Hbar,
  TopicCreateTransaction,
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

let cachedHcsTopicId = process.env.HCS_TOPIC_ID || null;
let hcsTopicCreationPromise = null;

function parsePrivateKey(privateKey) {
  const keyType = (process.env.PRIVATE_KEY_TYPE || "ECDSA").toUpperCase();
  if (keyType === "ED25519") {
    return PrivateKey.fromStringED25519(privateKey);
  }
  return PrivateKey.fromStringECDSA(privateKey);
}

function getClient() {
  const accountId = process.env.ACCOUNT_ID;
  const privateKey = process.env.PRIVATE_KEY;
  if (!accountId || !privateKey)
    throw new Error("Missing ACCOUNT_ID or PRIVATE_KEY");

  const accountIdPattern = /^\d+\.\d+\.\d+$/;
  if (!accountIdPattern.test(accountId)) {
    throw new Error(
      "ACCOUNT_ID must be a Hedera account ID like 0.0.12345 (not a private key hex).",
    );
  }

  return Client.forTestnet().setOperator(
    accountId,
    parsePrivateKey(privateKey),
  );
}

async function logToHcs(client, topicId, message) {
  try {
    const resolvedTopicId = await ensureHcsTopicId(client, topicId);
    const submit = new TopicMessageSubmitTransaction()
      .setTopicId(resolvedTopicId)
      .setMessage(message);
    const resp = await submit.execute(client);
    const receipt = await resp.getReceipt(client);
    return receipt;
  } catch (err) {
    console.error("Failed to submit HCS message:", err?.message || err);
    return null;
  }
}

async function ensureHcsTopicId(client, topicId) {
  const configuredTopicId = topicId || cachedHcsTopicId;
  if (configuredTopicId) {
    cachedHcsTopicId = configuredTopicId;
    return configuredTopicId;
  }

  if (!hcsTopicCreationPromise) {
    hcsTopicCreationPromise = (async () => {
      const tx = new TopicCreateTransaction();
      const resp = await tx.execute(client);
      const receipt = await resp.getReceipt(client);
      const createdTopicId = receipt.topicId?.toString();
      if (!createdTopicId) {
        throw new Error(
          "Failed to create HCS topic: missing topicId in receipt",
        );
      }
      cachedHcsTopicId = createdTopicId;
      console.log(`Created HCS topic: ${createdTopicId}`);
      return createdTopicId;
    })();
  }

  return hcsTopicCreationPromise;
}

export async function shariaTransfer(recipient, hbars = "1", options = {}) {
  const client = options.client || getClient();
  const topicId = options.hcsTopicId || process.env.HCS_TOPIC_ID;
  const perform = options.perform ?? process.env.PERFORM_TRANSFERS === "true";

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
    const hcsReceipt = await logToHcs(client, topicId, JSON.stringify(audit));
    return { allowed: false, reason, audit, hcsReceipt };
  }

  // allowed
  const reason = "Allowed";
  const audit = { timestamp, recipient, category, decision: "allowed", reason };
  const hcsReceipt = await logToHcs(client, topicId, JSON.stringify(audit));

  if (!perform) {
    return { allowed: true, dryRun: true, reason, audit, hcsReceipt };
  }

  try {
    const tx = new TransferTransaction()
      .addHbarTransfer(process.env.ACCOUNT_ID, Hbar.fromString(`-${hbars}`))
      .addHbarTransfer(recipient, Hbar.fromString(hbars));

    const submit = await tx.execute(client);
    const receipt = await submit.getReceipt(client);
    return {
      allowed: true,
      reason: "Executed successfully",
      receipt,
      audit,
      hcsReceipt,
    };
  } catch (err) {
    const message = String(err?.message || err || "unknown error");
    const keyType = (process.env.PRIVATE_KEY_TYPE || "ECDSA").toUpperCase();
    if (message.includes("INVALID_SIGNATURE")) {
      return {
        allowed: false,
        reason: `transfer failed: ${message}. Check that ACCOUNT_ID matches PRIVATE_KEY and PRIVATE_KEY_TYPE (${keyType}). If your Hedera account is ED25519, set PRIVATE_KEY_TYPE=ED25519.`,
        audit,
      };
    }

    return {
      allowed: false,
      reason: `transfer failed: ${message}`,
      audit,
      hcsReceipt,
    };
  }
}

export function setLookup(obj) {
  Object.assign(LOOKUP, obj);
}

export default { shariaTransfer, setLookup };
