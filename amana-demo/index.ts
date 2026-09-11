import { Client, PrivateKey } from "@hiero-ledger/sdk";
import { AgentMode } from "@hashgraph/hedera-agent-kit";
import { coreAccountQueryPlugin } from "@hashgraph/hedera-agent-kit/plugins";
import { HederaLangchainToolkit } from "@hashgraph/hedera-agent-kit-langchain";
import { ChatAnthropic } from "@langchain/anthropic";
import { createAgent } from "langchain";
import * as dotenv from "dotenv";

dotenv.config();

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

  const agent = createAgent({
    model: new ChatAnthropic({ model: "claude-2" }),
    tools: toolkit.getTools(),
    systemPrompt:
      "You are a helpful assistant with access only to Hedera account balance tools. Keep replies brief.",
  });

  const response = await agent.invoke({
    messages: [{ role: "user", content: "What's my HBAR balance?" }],
  });

  const lastMessage = response.messages[response.messages.length - 1];
  console.log(lastMessage.content);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
