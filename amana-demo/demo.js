import dotenv from "dotenv";
import { shariaTransfer, setLookup } from "./shariaPolicy.js";

dotenv.config();

// Optional: override the built-in lookup with env or inline mapping
setLookup({
  // Use example IDs — replace with your real test accounts for live runs
  "0.0.compliant1": "asset-backed",
  "0.0.noncompliant1": "interest-lending",
});

async function run() {
  const tests = [
    { name: "Compliant transfer", recipient: "0.0.compliant1", amount: "1" },
    {
      name: "Non-compliant transfer",
      recipient: "0.0.noncompliant1",
      amount: "1",
    },
    { name: "Unknown recipient", recipient: "0.0.unknown1", amount: "1" },
  ];

  for (const t of tests) {
    console.log("\n====", t.name, "====");
    try {
      const res = await shariaTransfer(t.recipient, t.amount, {
        perform: false,
      });
      if (res.allowed) {
        console.log(
          "Result: ✅ allowed",
          res.dryRun ? "(dry-run)" : "",
          "-",
          res.reason,
        );
      } else {
        console.log("Result: ❌ blocked -", res.reason);
      }
      if (res.audit) console.log("Audit:", res.audit);
      if (res.receipt) console.log("Hedera receipt:", res.receipt);
    } catch (err) {
      console.error("Error during test:", err?.message || err);
    }
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
