# AmanaScore

AmanaScore is a Hedera testnet demo that blocks non-compliant transfers with a custom Sharia policy and logs every decision to Hedera Consensus Service (HCS).

## Problem

Islamic finance has very little on-chain compliance infrastructure. Most payment flows do not check whether a transfer is acceptable before executing, and they rarely preserve an auditable trail of that decision.

## Solution

This project uses Hedera Agent Kit and the Hedera SDK to:

- check a recipient against a simple compliance lookup table,
- block transfers to non-compliant accounts,
- execute compliant HBAR transfers on Hedera testnet,
- log every allow/reject decision to HCS.

The compliance rule is intentionally simple and rule-based. It is a small demo, not a scholar-certified ruling.

## Architecture

Claude / Groq LLM demo path → Hedera Agent Kit tools → `ShariaCompliancePolicy` → HCS audit log

The transfer pipeline lives in [demo.js](demo.js) and the compliance / HCS logic lives in [shariaPolicy.js](shariaPolicy.js).

## What Works Right Now

- Real compliant transfer execution on Hedera testnet.
- Policy rejection for a non-compliant recipient.
- Dry-run support for unknown recipients.
- Automatic HCS topic creation when `HCS_TOPIC_ID` is not configured.
- HCS receipts for every audit event.

## Setup

1. Copy the example env file.

```bash
cp .env.example .env
```

2. Fill in your testnet credentials and recipient accounts.

Required values:

- `ACCOUNT_ID` - your Hedera testnet account ID, like `0.0.12345`
- `PRIVATE_KEY` - the matching private key for that account
- `PRIVATE_KEY_TYPE` - `ECDSA` or `ED25519`
- `COMPLIANT_RECIPIENT_ACCOUNT_ID` - a real Hedera testnet account you control
- `NONCOMPLIANT_RECIPIENT_ACCOUNT_ID` - a second account you want the policy to reject

Optional values:

- `HCS_TOPIC_ID` - reuse an existing HCS topic instead of auto-creating one
- `PERFORM_TRANSFERS` - set to `true` to execute the compliant transfer for real
- `DEMO_TIMEOUT_MS` - overall timeout for the demo runner
- `TRANSFER_TIMEOUT_MS` - timeout for each individual transfer step

If `HCS_TOPIC_ID` is not set, the app creates one automatically the first time it needs to log an audit event.

## Run

Policy and HCS demo:

```bash
npm run transfer-demo
```

That runs [demo.js](demo.js) and shows:

- compliant transfer: allowed, and executed when `PERFORM_TRANSFERS=true`
- non-compliant transfer: blocked before execution
- unknown recipient: allowed in dry-run mode

Quick policy-only demo:

```bash
npm run demo
```

Quick balance check / agent path:

```bash
npm start
```

## Demo Notes

Current demo behavior:

- compliant transfer executes successfully on testnet when live mode is enabled,
- rejected transfers are stopped by the policy,
- audit events are written to HCS and the topic ID is printed the first time it is created.

Use `HCS_TOPIC_ID=0.0.xxxxx` in `.env` if you want to reuse the same topic between runs.

## Video

Add the hackathon demo video link here before submission.

## Troubleshooting

- `INVALID_SIGNATURE` usually means `ACCOUNT_ID`, `PRIVATE_KEY`, and `PRIVATE_KEY_TYPE` do not match.
- `ACCOUNT_ID must be a Hedera account ID like 0.0.12345` means the account ID field contains a private key string.
- If you see a timeout, increase `DEMO_TIMEOUT_MS` or `TRANSFER_TIMEOUT_MS` in `.env`.

## Security Note

Do not commit `.env`. The repo already ignores local secrets and the cloned reference repo.
