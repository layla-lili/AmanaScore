import { AbstractPolicy } from "@hashgraph/hedera-agent-kit";
import { coreAccountPluginToolNames } from "@hashgraph/hedera-agent-kit/plugins";

export const SHARIA_CATEGORIES = {
  "0.0.compliant1": "asset-backed",
  "0.0.noncompliant1": "interest-lending",
};

export function evaluateShariaTransferDecision(
  transfers,
  categoryLookup = SHARIA_CATEGORIES,
) {
  const details = (transfers ?? []).map((transfer) => {
    const accountId = String(transfer.accountId);
    const category = categoryLookup[accountId] ?? "unknown";
    return { accountId, category, amount: transfer.amount };
  });

  const blockedTransfer = details.find(
    (transfer) => transfer.category === "interest-lending",
  );

  if (blockedTransfer) {
    return {
      allowed: false,
      accountId: blockedTransfer.accountId,
      category: blockedTransfer.category,
      reason:
        "Non-compliant: transaction involves an interest-bearing structure (riba)",
      details,
    };
  }

  return {
    allowed: true,
    accountId: details[0]?.accountId ?? "unknown",
    category: details[0]?.category ?? "unknown",
    reason: "Compliant or unknown category, allowed by default",
    details,
  };
}

export class ShariaCompliancePolicy extends AbstractPolicy {
  name = "Sharia Compliance Policy";
  description = "Blocks HBAR transfers to accounts marked as interest-lending";
  relevantTools = [coreAccountPluginToolNames.TRANSFER_HBAR_TOOL];

  constructor(categoryLookup = SHARIA_CATEGORIES) {
    super();
    this.categoryLookup = categoryLookup;
  }

  shouldBlockPostParamsNormalization(params, method) {
    const transfers = params.normalisedParams?.hbarTransfers ?? [];
    const decision = evaluateShariaTransferDecision(
      transfers,
      this.categoryLookup,
    );

    if (decision.allowed) {
      console.log(
        `ShariaCompliancePolicy: ${method} allowed for ${decision.accountId} (${decision.category})`,
      );
      return false;
    }

    console.log(
      `ShariaCompliancePolicy: ${method} blocked for ${decision.accountId} (${decision.category})`,
    );
    throw new Error(decision.reason);
  }
}
