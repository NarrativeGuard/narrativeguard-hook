# Hackathon Submission Draft

## Project

NarrativeGuard: X Layer Meme Launch Risk OS

## One-Liner

A Hook-powered risk operating system for meme launches, using a Uniswap v4 `beforeSwap` Hook to turn offchain narrative risk into onchain trading protection.

## Event Requirements Alignment

- Built around Uniswap v4 Hook logic.
- Target deployment: X Layer mainnet.
- Final submission can include the deployed Hook address and the v4 PoolId under the X Layer PoolManager.
- Dedicated project X account required.
- Submission/social posts must tag `@XLayerOfficial`, `@Uniswap`, and `@flapdotsh`.
- Official deadline: 2026-05-28 23:59 UTC / 2026-05-29 07:59 Asia/Shanghai.
- Demo video is optional but recommended, 1 to 3 minutes.

## Mainnet Deployment

Public Risk OS demo:

```text
https://narrativeguard-hook.vercel.app
```

Repository:

```text
https://github.com/NarrativeGuard/narrativeguard-hook
```

Hook:

```text
0xAa242C1c9Dac355D6a66eA165E3Dfa96D0924080
```

V4 PoolId:

```text
0xa9e01de25bcd4f5917afcfbb2b5728a1dfd392d360e7c9d7cefe10d4465dc893
```

PoolManager:

```text
0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32
```

Deployment status: configured live demo. Use these addresses for the public demo and submission unless a fresh Hook is also configured and paired with a newly initialized v4 pool before the final form is submitted.

Initialize pool tx:

```text
0xddf9684b8e64829b56836322d3a0c8acaedb2c0c7545d3eb3db49e2a281313a1
```

Full deployment notes: [XLAYER_MAINNET_DEPLOYMENT.md](XLAYER_MAINNET_DEPLOYMENT.md)

## Problem

Meme markets move before traditional risk systems can react. A single rumor, KOL rotation, fresh-wallet wave, or liquidity scare can turn a pool into a sniper target. Most current DEX protection is static: fixed fees, fixed caps, and manual pauses.

## Solution

NarrativeGuard gives meme launch teams a full Risk OS. The frontend is the command center; the v4 Hook is the enforcement layer; the narrative oracle score is the signal layer.

Before each swap, the hook can:

- raise LP fees as risk rises;
- block high-risk launch-window snipes;
- enforce a single-trade cap;
- apply trader cooldowns;
- honor whitelist/blacklist decisions;
- emergency-pause the pool through owner/oracle controls.

The product console adds:

- Launch Shield templates for fair launch, viral spike, and emergency defense modes;
- risk report with top narrative drivers;
- Oracle Agent Mesh status;
- Hook response timeline;
- swap gate and rule controls;
- wallet-connected X Layer deployment, live policy reads, writes, and event activity.

## Technical Implementation

- Built on Uniswap v4 `BaseHook`.
- Uses the `beforeSwap` hook permission.
- Stores per-pool `GuardConfig`.
- Computes dynamic fee override for v4 dynamic-fee pools.
- Uses custom errors for clear revert reasons.
- Uses CREATE2 salt mining so the deployed hook address contains the required permission bits.
- Includes Hardhat unit tests for fee override, anti-snipe, cooldown, trade cap, list controls, router hookData, oracle score update, pause, static-fee behavior, and unsafe admin inputs.
- Includes internal audit notes covering access control, pool binding, fee math, router data validation, list precedence, and deployment receipt handling.

## Scoring Fit

Innovation:

NarrativeGuard uses v4 Hooks to add a new market-structure layer for meme pools: narrative-aware trade policy. Instead of copying an existing AMM mechanic, it lets external social, wallet, liquidity, and project-risk context shape execution behavior at `beforeSwap`.

Market value:

Meme launches are high-frequency, social-driven, and attack-prone. Pools that can adapt fees, throttle sniper flow, and pause on severe narrative risk can protect LPs, builders, and retail users while still preserving open market access.

Completeness:

The current implementation includes contracts, tests, deployment scripts, a bilingual wallet-connected Risk OS console, submission materials, and a deployed X Layer mainnet Hook plus initialized v4 pool. The frontend can load the current configured deployment, read live policy, update narrative risk score, pause/resume the pool, read activity, and deploy a fresh demo through wallet confirmations. If a final source-refresh deployment is made, the submitted address should only be changed after `configurePool` and pool initialization both succeed.

## X Layer Fit

X Layer is an EVM-compatible L2 with low fees and OKB as the native token, making it a strong environment for high-velocity consumer trading experiments. NarrativeGuard is designed for exactly that market: fast meme launches where narrative moves first and onchain policy must adjust quickly.

## Demo Flow

1. Open the Risk OS console and show the bilingual language switch.
2. Apply a Launch Shield template.
3. Raise narrative-risk signals and show the risk report, fee, Hook decision, and timeline update.
4. Trigger anti-snipe, single-trade cap, cooldown, whitelist, blacklist, and emergency pause states.
5. Show the Oracle Agent Mesh and action queue.
6. Connect a wallet, load the current X Layer deployment, and refresh live onchain policy.
7. Show wallet-signed score update and pause/resume controls.
8. Show live X Layer activity and explorer links.
9. Show tests and deployment verification output.
10. End with the Hook address, PoolId, and prize pitch.

## Current Scope

Completed:

- Smart contracts.
- Unit tests.
- CREATE2 deployment script.
- Bilingual Risk OS frontend and wallet-connected live controls.
- Public Vercel demo URL.
- README and submission materials.

Still outside this hackathon implementation:

- Production oracle aggregation and signing.
- Independent security audit.

## Future Roadmap

- Signed narrative-score attestations from multiple offchain agents.
- Pool-specific router integration to prevent trader spoofing.
- Public risk event feed and explorer view.
- Per-token launch templates for fair meme launches.
- Simulation mode using forked v4 pools.
