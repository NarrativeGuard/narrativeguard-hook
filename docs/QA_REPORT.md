# QA Report

Date: 2026-05-26

## Automated Checks

Passed:

- `npm run check`
  - Hardhat compile
  - TypeScript typecheck
  - 12 Hardhat/node tests
  - frontend production build
- `npm audit --audit-level=moderate`
- `npm --prefix frontend audit --audit-level=moderate`
- `npm run verify:xlayer-mainnet`

## Contract Coverage

Passing tests cover:

- dynamic LP fee override;
- oversized trade blocking;
- cooldown enforcement;
- anti-snipe launch window;
- whitelist bypass;
- trusted-router `hookData`, including trailing router metadata;
- oracle score update;
- emergency pause;
- config validation;
- blacklist precedence;
- malformed router data;
- unsafe admin inputs;
- static-fee pool behavior;
- unconfigured pool fail-open behavior.

## Frontend Interaction QA

Passed:

- English / Chinese language switching.
- Launch templates: Fair Launch Guard, Viral Spike Mode, Emergency Defense.
- Top pause/resume button.
- Deterministic reset button.
- Risk signal controls render six valid `0..100` values.
- Trade gate inputs trigger and clear trade-cap blocking.
- List mode segmented options: normal, whitelist, blacklist.
- Admin policy inputs: base fee, max fee, anti-snipe threshold.
- Rule toggles: emergency pause, anti-snipe, single-trade cap, cooldown.
- Action queue: tighten caps, maker allowlist, emergency switch.
- Wallet panel public reads:
  - Load Current;
  - Refresh Onchain;
  - Refresh Activity with RPC event-scan fallback;
  - no-wallet handling for connect/write paths.

## Responsive QA

Passed at:

- desktop `1440 x 900`;
- tablet `900 x 900`;
- mobile `390 x 844`.

No horizontal page overflow or button text overflow was detected in these viewports.

## Issues Found And Fixed

- Reset previously depended on the current risk score after repeated template clicks. It is now deterministic and restores the Viral Spike baseline.
- X Layer public RPC event scanning can return an invalid-parameters response for event logs. The activity panel now treats this as an indexer-readiness state: it still verifies code and transaction receipts, shows transaction rows, and avoids presenting the fallback as a user-facing failure.
- Activity history previously depended on the first public deployment's hardcoded configure/init transaction hashes. It now tracks the active frontend deployment transaction hashes and uses the hardcoded hashes only when the current public deployment is selected.
- Frontend write calls now include explicit gas limits for demo token deployment, Hook policy configuration, v4 pool initialization, risk-score updates, and emergency pause/resume calls.
- Trusted-router `hookData` previously required exactly one encoded address. It now reads the first encoded address and allows trailing router metadata while rejecting short, non-canonical, or zero-address data.

## Before Production TVL

Before production TVL, complete:

- source-verification refresh if exact bytecode/source matching is required;
- after any source-refresh deployment, configure the new Hook and initialize a matching v4 pool before updating public addresses;
- wallet-signed writes are tested manually with the intended owner/oracle wallet;
- a real oracle/multisig operational setup is added;
- an independent third-party security audit is completed.
