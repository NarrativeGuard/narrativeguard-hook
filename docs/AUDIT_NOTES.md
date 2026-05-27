# Internal Audit Notes

Date: 2026-05-26

Scope reviewed:

- `NarrativeGuardHook` access control, pool binding, swap-screening order, fee math, list precedence, trusted-router `hookData`, and time-window arithmetic.
- Hardhat tests and mock PoolManager behavior.
- CREATE2 deployment script, transaction receipt handling, generated frontend artifacts, and X Layer deployment output.
- Frontend Risk OS console and wallet-based deployment panel.
- README and hackathon submission materials.

This is an internal engineering review, not an independent third-party audit.

## Hardening Completed

- Added strict zero-address checks for list accounts, trusted routers, and resolved traders.
- Added trusted-router `hookData` validation that reads the first ABI-encoded address while allowing optional trailing router metadata.
- Added launch-window overflow validation before storing pool config.
- Added batch global and per-pool list setters for safer admin operations without changing swap-path complexity.
- Preserved O(1) swap-path checks: pause, blacklist, whitelist, anti-snipe, max trade, cooldown, fee override.
- Added transaction receipt status checks to deployment flows.
- Added X Layer explorer links and hook code-size metadata to generated deployment output.
- Added frontend Hook deployment gas limit and post-deploy code existence check.
- Added explicit frontend gas limits for demo token deployment, pool configuration, pool initialization, risk-score update, and emergency pause calls to reduce wallet gas-estimation failures on X Layer RPCs.
- Removed stale activity-panel coupling to the first hardcoded deployment transactions when the user deploys a fresh Hook/pool from the frontend. The panel now tracks the active configure/init transaction hashes and falls back to the current public deployment only when that deployment is selected.
- Added activity-panel fallback behavior for X Layer RPC event-index incompatibility: code checks and transaction receipt checks still refresh, and the UI presents this as "receipts verified" instead of a failed scan.
- Added TypeScript type-checking to the full local `check` command.
- Replaced the broad Hardhat toolbox with the minimal viem and node-test plugins used by this project.
- Resolved npm audit findings; root and frontend dependency audits report zero vulnerabilities.
- Verified the deployment script on a local simulated network without using any private-key-backed account.
- Expanded tests from 6 to 12 cases, covering bad config, blacklist precedence, malformed router data, unsafe admin inputs, static-fee pools, and unconfigured pools.

## Current Design Constraints

- `riskOracle` is trusted. It can update risk scores and pause pools, so production deployments should use a multisig, timelocked admin, or signed-attestation oracle.
- Trusted routers can identify the real trader through `hookData`. Only routers with audited encoding behavior should be trusted.
- Trusted-router `hookData` uses the first ABI-encoded address as the real trader. Routers may append metadata, but only audited routers should be marked trusted.
- The whitelist intentionally bypasses anti-snipe, max-trade, and cooldown rules, but it does not bypass emergency pause or blacklist.
- Unconfigured pools fail open. This avoids bricking pools accidentally attached to the Hook, but production operators should configure pools immediately after initialization.
- The Hook screens swaps and can override LP fees for dynamic-fee pools. It does not manage liquidity, token minting, or offchain oracle aggregation.
- Per-address cooldowns cannot stop a determined multi-wallet Sybil strategy by themselves. The intended layered defense is anti-snipe windows, trade caps, blacklist/allowlist operations, and future oracle/attestation scoring.

## External Audit Triage

An external AI review correctly identified that a later Hook address, `0x517D1fB0Fc551B4622fC8d2815502e7D2d370080`, has deployed code but is not configured for the current public PoolId. The repository therefore keeps the configured live demo at `0x86Ef9197Bde5Dd40352D0a58589b1772376B4080` as the frontend default instead of routing users to an unconfigured fail-open Hook.

The same review flagged hardcoded activity transactions. The current frontend only falls back to the public configure/init transactions when the loaded Hook is the public deployment; fresh frontend deployments use the transaction hashes stored in React state.

The cooldown Sybil limitation and oracle/owner centralization are design constraints, not one-line contract bugs. They are documented here and should be addressed with router attribution, attestation scoring, multisig/timelock administration, and production oracle design before significant TVL.

## Verification Note

The X Layer deployment is a configured live demo deployment. The verification script now checks code, transaction receipts, and that the submitted PoolId is enabled in the Hook config. The deployment flow can refresh public addresses from the current source if the submitted explorer bytecode must match the latest repository state exactly; after a refresh, the new Hook must also be configured and initialized before the frontend/docs are changed.
