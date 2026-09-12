import dotenv from "dotenv";
import { shariaTransfer, setLookup } from "./shariaPolicy.js";

dotenv.config();

const performTransfers = process.env.PERFORM_TRANSFERS === "true";
const demoTimeoutMs = Number(process.env.DEMO_TIMEOUT_MS || 45000);
const transferTimeoutMs = Number(process.env.TRANSFER_TIMEOUT_MS || 30000);

const compliantRecipient = "0.0.compliant1";
const realCompliantRecipient = process.env.COMPLIANT_RECIPIENT_ACCOUNT_ID;
const noncompliantRecipient =
  process.env.NONCOMPLIANT_RECIPIENT_ACCOUNT_ID || "0.0.noncompliant1";
const unknownRecipient =
  process.env.UNKNOWN_RECIPIENT_ACCOUNT_ID || "0.0.unknown1";

setLookup({
  [performTransfers && realCompliantRecipient
    ? realCompliantRecipient
    : compliantRecipient]: "asset-backed",
  [noncompliantRecipient]: "interest-lending",
});

function requireRealRecipientIfPerforming() {
  if (!performTransfers) {
    return;
  }

  if (!realCompliantRecipient) {
    throw new Error(
      "PERFORM_TRANSFERS=true requires COMPLIANT_RECIPIENT_ACCOUNT_ID to be set to a real Hedera testnet account.",
    );
  }
}

async function run() {
  requireRealRecipientIfPerforming();

  const tests = [
    {
      name: "Compliant transfer",
      recipient: performTransfers ? realCompliantRecipient : compliantRecipient,
      amount: "1",
      perform: performTransfers,
    },
    {
      name: "Non-compliant transfer",
      recipient: noncompliantRecipient,
      amount: "1",
      perform: true,
    },
    {
      name: "Unknown recipient",
      recipient: unknownRecipient,
      amount: "1",
      perform: false,
    },
  ];

  for (const t of tests) {
    console.log("\n====", t.name, "====");
    try {
      const res = await withTimeout(
        shariaTransfer(t.recipient, t.amount, {
          perform: t.perform,
        }),
        transferTimeoutMs,
        `${t.name} timed out after ${transferTimeoutMs}ms`,
      );
      if (res.allowed) {
        console.log(
          "Result: ✅ allowed",
          res.dryRun ? "(dry-run)" : "(executed)",
          "-",
          res.reason,
        );
      } else {
        console.log("Result: ❌ blocked -", res.reason);
      }
      if (res.audit) console.log("Audit:", res.audit);
      if (res.hcsReceipt) {
        console.log("HCS receipt:", {
          topicSequenceNumber: String(
            res.hcsReceipt.topicSequenceNumber ?? "0",
          ),
          nodeId: String(res.hcsReceipt.nodeId ?? ""),
          status: String(res.hcsReceipt.status ?? ""),
        });
      }
      if (res.receipt) console.log("Hedera receipt:", res.receipt);
    } catch (err) {
      console.error("Error during test:", err?.message || err);
    }
  }
}

function withTimeout(promise, timeoutMs, label) {
  let timerId;
  const timeout = new Promise((_, reject) => {
    timerId = setTimeout(() => reject(new Error(label)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timerId);
  });
}

withTimeout(run(), demoTimeoutMs, `Demo timed out after ${demoTimeoutMs}ms`)
  .catch((e) => {
    console.error(e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode || 0);
  });
