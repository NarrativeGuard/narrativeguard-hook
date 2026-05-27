import { readFile } from "node:fs/promises";

import { createPublicClient, getAddress, http } from "viem";

const deploymentPath = new URL("../deployments/xlayerMainnet.json", import.meta.url);
const deployment = JSON.parse(await readFile(deploymentPath, "utf8"));

const rpcUrl = process.env.XLAYER_MAINNET_RPC_URL || "https://rpc.xlayer.tech";
const client = createPublicClient({
  transport: http(rpcUrl),
});

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
console.log("Deployment verification passed.");
