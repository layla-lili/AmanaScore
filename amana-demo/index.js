import { Client, PrivateKey, AccountBalanceQuery } from "@hiero-ledger/sdk";
import { AgentMode } from "@hashgraph/hedera-agent-kit";
import { coreAccountQueryPlugin } from "@hashgraph/hedera-agent-kit/plugins";
import { HederaLangchainToolkit } from "@hashgraph/hedera-agent-kit-langchain";
import { ChatGroq } from "@langchain/groq";
import { createAgent } from "langchain";
import dotenv from "dotenv";

dotenv.config();

const GROQ_MODEL_CANDIDATES = [
  process.env.GROQ_MODEL?.trim(),
  "qwen/qwen3.6-27b",
  "qwen/qwen3.8-27b",
  "llama-3.1-8b-instant",
  "llama-3.1-70b-versatile",
  "mixtral-8x7b-32768",
  "gemma2-9b-it",
  "groq/compound-mini",
  "groq/compound",
  "openai/gpt-oss-120b",
].filter(Boolean);

const GROQ_AUTO_FALLBACK_ORDER = [
  "qwen/qwen3.6-27b",
  "qwen/qwen3.8-27b",
  "llama-3.1-8b-instant",
  "llama-3.1-70b-versatile",
  "mixtral-8x7b-32768",
  "gemma2-9b-it",
  "groq/compound-mini",
  "groq/compound",
  "openai/gpt-oss-120b",
];

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

async function getGroqAvailableModelIds(apiKey) {
  const response = await fetch("https://api.groq.com/openai/v1/models", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to list Groq models (${response.status})`);
  }

  const payload = await response.json();
  return new Set((payload.data || []).map((model) => model.id));
}

function isGroqModelNotAvailable(error) {
  const message =
    `${error?.message || ""} ${error?.error?.message || ""}`.toLowerCase();
  return (
    message.includes("model_not_found") ||
    message.includes("does not exist") ||
    message.includes("do not have access")
  );
}

async function probeGroqModel(apiKey, modelId) {
  const model = new ChatGroq({
    model: modelId,
    apiKey,
    maxTokens: 32,
  });
  await model.invoke("Reply with exactly one word: ok");
  return model;
}

async function resolveGroqModel(apiKey) {
  let availableModelIds;

  try {
    availableModelIds = await getGroqAvailableModelIds(apiKey);
  } catch (error) {
    console.warn(`Could not list Groq models: ${error?.message || error}`);
    return null;
  }

  const orderedCandidates = uniqueStrings(GROQ_MODEL_CANDIDATES).filter(
    (modelId) => availableModelIds.has(modelId),
  );

  const autoFallbackCandidates = GROQ_AUTO_FALLBACK_ORDER.filter((modelId) =>
    availableModelIds.has(modelId),
  );

  const candidatesToTry = uniqueStrings([
    ...orderedCandidates,
    ...autoFallbackCandidates,
  ]);

  if (candidatesToTry.length === 0) {
    console.warn(
      `No preferred Groq model matched your account. Available Groq models: ${Array.from(availableModelIds).slice(0, 10).join(", ") || "none"}`,
    );
    return null;
  }

  for (const modelId of candidatesToTry) {
    try {
      const model = await probeGroqModel(apiKey, modelId);
      console.log(`Using Groq model: ${modelId}`);
      return model;
    } catch (error) {
      if (isGroqModelNotAvailable(error)) {
        console.warn(
          `Groq model ${modelId} is listed but not usable for this account; trying next candidate.`,
        );
        continue;
      }

      throw error;
    }
  }

  return null;
}

async function main() {
  const accountId = process.env.ACCOUNT_ID;
  const privateKey = process.env.PRIVATE_KEY;
  if (!accountId || !privateKey) {
    console.error("Missing ACCOUNT_ID or PRIVATE_KEY in .env");
    process.exit(1);
  }

  const client = Client.forTestnet().setOperator(
    accountId,
    PrivateKey.fromStringECDSA(privateKey),
  );

  const toolkit = new HederaLangchainToolkit({
    client,
    configuration: {
      plugins: [coreAccountQueryPlugin],
      context: { mode: AgentMode.AUTONOMOUS },
    },
  });

  let model = null;

  if (process.env.GROQ_API_KEY) {
    try {
      model = await resolveGroqModel(process.env.GROQ_API_KEY);
    } catch (error) {
      console.warn(`Could not list Groq models: ${error?.message || error}`);
    }
  }

  if (!model) {
    console.log(
      "Skipping LLM agent because no Groq model is available. Falling back to direct Hedera balance query.",
    );
  }

  try {
    if (model) {
      const agent = createAgent({
        model,
        tools: toolkit.getTools(),
        systemPrompt:
          "You are a helpful assistant with access only to Hedera account balance tools. Keep replies brief.",
      });

      const response = await agent.invoke({
        messages: [{ role: "user", content: "What's my HBAR balance?" }],
      });

      const lastMessage = response.messages[response.messages.length - 1];
      console.log(lastMessage.content);
      return;
    }

    const balance = await new AccountBalanceQuery()
      .setAccountId(accountId)
      .execute(client);
    console.log(`Account balance: ${balance.hbars.toString()}`);
  } catch (err) {
    console.error("LLM call failed:", err?.message || err);
    try {
      const balance = await new AccountBalanceQuery()
        .setAccountId(accountId)
        .execute(client);
      console.log(`Account balance: ${balance.hbars.toString()}`);
    } catch (balErr) {
      console.error(
        "Failed to query Hedera balance as fallback:",
        balErr?.message || balErr,
      );
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
