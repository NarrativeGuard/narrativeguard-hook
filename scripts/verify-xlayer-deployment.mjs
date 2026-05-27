import { readFile } from "node:fs/promises";

import { createPublicClient, getAddress, http } from "viem";

const deploymentPath = new URL("../deployments/xlayerMainnet.json", import.meta.url);
const deployment = JSON.parse(await readFile(deploymentPath, "utf8"));

const rpcUrl = process.env.XLAYER_MAINNET_RPC_URL || "https://rpc.xlayer.tech";
const client = createPublicClient({
  transport: http(rpcUrl),
});

const hookAbi = [
  {
    type: "function",
    name: "poolManager",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "riskOracle",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "quoteFee",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [{ type: "uint24" }],
  },
  {
    type: "function",
    name: "getConfig",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      {
        name: "config",
        type: "tuple",
        components: [
          { name: "enabled", type: "bool" },
          { name: "paused", type: "bool" },
          { name: "riskScoreBps", type: "uint16" },
          { name: "antiSnipeRiskBps", type: "uint16" },
          { name: "baseFeePips", type: "uint24" },
          { name: "maxFeePips", type: "uint24" },
          { name: "maxTradeSize", type: "uint128" },
          { name: "cooldownSeconds", type: "uint32" },
          { name: "antiSnipeSeconds", type: "uint32" },
          { name: "launchTimestamp", type: "uint64" },
          { name: "narrativeHash", type: "bytes32" },
        ],
      },
    ],
  },
];

function requireAddress(value, label) {
  if (!value) throw new Error(`${label} is missing from deployments/xlayerMainnet.json`);
  return getAddress(value);
}

async function checkCode(address, label) {
  const code = await client.getCode({ address });
  if (!code || code === "0x") throw new Error(`${label} has no code: ${address}`);
  const bytes = (code.length - 2) / 2;
  console.log(`${label}: ${address} (${bytes} code bytes)`);
  return bytes;
}

async function checkReceipt(hash, label) {
  if (!hash) return;
  const receipt = await client.getTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
  console.log(`${label}: ${hash} (${receipt.status}, gas ${receipt.gasUsed})`);
}

async function readHook(functionName, args = []) {
  return client.readContract({
    address: requireAddress(deployment.hook, "hook"),
    abi: hookAbi,
    functionName,
    args,
  });
}

async function checkHookState() {
  const expectedManager = requireAddress(deployment.poolManager, "poolManager");
  const expectedOracle = deployment.riskOracle ? requireAddress(deployment.riskOracle, "riskOracle") : undefined;
  const expectedOwner = deployment.owner
    ? requireAddress(deployment.owner, "owner")
    : deployment.deployer
      ? requireAddress(deployment.deployer, "deployer")
      : undefined;

  const [manager, owner, oracle, config, quotedFee] = await Promise.all([
    readHook("poolManager"),
    readHook("owner"),
    readHook("riskOracle"),
    readHook("getConfig", [deployment.poolId]),
    readHook("quoteFee", [deployment.poolId]),
  ]);

  if (getAddress(manager) !== expectedManager) {
    throw new Error(`Hook PoolManager mismatch: expected ${expectedManager}, got ${manager}`);
  }
  if (expectedOracle && getAddress(oracle) !== expectedOracle) {
    throw new Error(`Hook riskOracle mismatch: expected ${expectedOracle}, got ${oracle}`);
  }
  if (expectedOwner && getAddress(owner) !== expectedOwner) {
    throw new Error(`Hook owner mismatch: expected ${expectedOwner}, got ${owner}`);
  }

  if (!config.enabled) {
    throw new Error(`Hook config is disabled for PoolId ${deployment.poolId}`);
  }

  console.log(
    `Hook config: enabled=${config.enabled}, paused=${config.paused}, riskScoreBps=${config.riskScoreBps}, quotedFeePips=${quotedFee}`,
  );
}

const chainId = await client.getChainId();
if (chainId !== 196) {
  throw new Error(`Expected X Layer chain ID 196, got ${chainId}`);
}

console.log(`RPC chain ID: ${chainId}`);
await checkCode(requireAddress(deployment.poolManager, "poolManager"), "PoolManager");
await checkCode(requireAddress(deployment.hook, "hook"), "Hook");

if (deployment.demoToken0) {
  await checkCode(requireAddress(deployment.demoToken0, "demoToken0"), "Demo token0");
}
if (deployment.demoToken1) {
  await checkCode(requireAddress(deployment.demoToken1, "demoToken1"), "Demo token1");
}

await checkReceipt(deployment.hookDeploymentTx, "Hook deployment tx");
await checkReceipt(deployment.configurePoolTx, "Configure pool tx");
await checkReceipt(deployment.initializePoolTx, "Initialize pool tx");

if (!deployment.poolId) {
  throw new Error("poolId is missing from deployments/xlayerMainnet.json");
}

console.log(`PoolId: ${deployment.poolId}`);
await checkHookState();
console.log("Deployment verification passed.");
