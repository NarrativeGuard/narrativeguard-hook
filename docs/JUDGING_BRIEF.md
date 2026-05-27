# Judging Brief

## Positioning

NarrativeGuard is **X Layer Meme Launch Risk OS**: a protocol console for launching, monitoring, and defending meme-token pools with a Uniswap v4 `beforeSwap` Hook.

The project is intentionally bigger than a single protection rule. It combines:

- onchain enforcement through a deployed v4 Hook;
- offchain narrative-risk inputs represented as oracle scores;
- wallet-controlled operator workflows for launch teams;
- live X Layer proof through deployed addresses, transactions, code checks, and event reads.

## Official Criteria Fit

The official Hook the Future page states that projects are judged on innovation, potential market value, completion, and an optional 1 to 3 minute demo video. It also requires a Uniswap v4 Hook project deployed on X Layer with verifiable addresses.

Official page: https://web3.okx.com/zh-hans/xlayer/build-x-hackathon/hook

Repository: https://github.com/NarrativeGuard/narrativeguard-hook

Live demo: https://narrativeguard-hook.vercel.app

## Innovation

NarrativeGuard uses the v4 Hook layer as a programmable market-structure engine. Instead of hardcoding one static fee or copying an existing AMM design, it lets narrative risk change swap-path behavior:

- dynamic fee override for toxic-flow pricing;
- anti-snipe blocking during launch windows;
- single-trade caps for large hostile orders;
- cooldowns for repeated flow;
- whitelist/blacklist controls for market makers and known attackers;
- emergency pause for severe narrative breaks.

The key idea: meme markets move through narrative first, then price. NarrativeGuard connects that earlier signal layer to `beforeSwap`.

## Market Value

The target users are not abstract DeFi developers. They are meme launch teams, market makers, LPs, and active traders on X Layer.

Real demand:

- projects want cleaner launches and fewer sniper-dominated charts;
- LPs want fee compensation when narrative risk rises;
- market makers need allowlist lanes during launches;
- traders need visible rules instead of surprise manual moderation;
- X Layer benefits from consumer-grade trading activity that is cheaper, faster, and easier to demonstrate.

This creates a believable path from hackathon demo to protocol product: every new meme launch can become a protected pool managed through the Risk OS.

## Completion

Completed deliverables:

- Solidity Hook contract using Uniswap v4 `BaseHook`;
- dynamic-fee, anti-snipe, cap, cooldown, list, and pause logic;
- CREATE2 salt mining for the required hook permission bits;
- local harness and mock PoolManager for deterministic tests;
- 12 Hardhat tests across major policy branches and edge cases;
- X Layer mainnet deployment with public addresses;
- read-only RPC verification script;
- bilingual frontend Risk OS console;
- wallet-connected deployment and live-operation panel;
- public demo URL: `https://narrativeguard-hook.vercel.app`;
- README, submission draft, checklist, tweet copy, audit notes, and demo video script.

## Onchain Proof

X Layer mainnet:

- Hook: `0x86Ef9197Bde5Dd40352D0a58589b1772376B4080`
- PoolManager: `0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32`
- PoolId: `0x57c6a64160f4f9fc82d32432ab6f242b52f28159e6ed882b024ebdf3ebf57bf1`
- Configure policy tx: `0xc18e335fe8d88c5d472485140dc9aeb667d91e981f543073916633711c4adac0`
- Initialize v4 pool tx: `0xaa1cb8472066987c4e5763faba214a69fe2450339abb340baef179ef71917a44`

The deployment scripts can refresh the public addresses from the current source if the final verification workflow requires exact latest-source bytecode matching.

## Demo Story

The demo should show the full protocol loop:

1. Open the Risk OS console.
2. Switch between English and Chinese.
3. Choose a launch protection template.
4. Move narrative-risk signals and watch the risk report, fee, and Hook decision update.
5. Trigger anti-snipe, cap, cooldown, whitelist, blacklist, and emergency pause states.
6. Load the current X Layer deployment.
7. Refresh live policy and onchain activity.
8. Show score update and pause/resume actions as wallet-signed writes.
9. Show terminal test and deployment verification output.
10. End on explorer links and the Hook/PoolId.

## Prize Narrative

One-sentence pitch:

> NarrativeGuard turns Uniswap v4 Hooks into a risk operating system for meme launches, so X Layer pools can react to narrative shocks before the market gets damaged.

Why it can win:

- it uses the Hook mechanism directly in the swap path;
- it is tailored to a real X Layer-native use case;
- it is understandable to non-technical judges;
- it has deployed proof, tests, a product console, and submission assets;
- it can grow into a reusable launch product rather than ending as a one-off script.
