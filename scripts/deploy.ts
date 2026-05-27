import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import hre, { network } from "hardhat";
import {
  concatHex,
  encodeDeployData,
  getAddress,
  getContract,
  getCreate2Address,
  numberToHex,
  padHex,
  type Address,
  type Hex,
} from "viem";

const CREATE2_DEPLOYER = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const HOOK_MASK = 0x3fffn;
const BEFORE_SWAP_FLAG = 0x80n;
const DYNAMIC_FEE_FLAG = 0x800000;
const DEFAULT_XLAYER_MAINNET_POOL_MANAGER = "0x360E68faccca8cA495c1B759Fd9EEe466db9FB32";
const XLAYER_MAINNET_EXPLORER = "https://www.okx.com/web3/explorer/xlayer";
const SQRT_PRICE_1_TO_1 = 79_228_162_514_264_337_593_543_950_336n;
const DEFAULT_HOOK_DEPLOY_GAS_LIMIT = 15_000_000n;

const poolManagerAbi = [
  {
    type: "function",
    name: "initialize",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "key",
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
        ],
      },
      { name: "sqrtPriceX96", type: "uint160" },
    ],
    outputs: [{ name: "tick", type: "int24" }],
  },
] as const;

type Artifact = {
  abi: readonly unknown[];
  bytecode: Hex;
};

function requiredAddress(value: string | undefined, name: string): Address {
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return getAddress(value) as Address;
}

function optionalAddress(value: string | undefined, fallback: Address): Address {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  return getAddress(value) as Address;
}

function optionalBigInt(value: string | undefined, fallback: bigint): bigint {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  return BigInt(value);
}

function mineHookSalt(initCode: Hex): { salt: Hex; hookAddress: Address } {
  for (let i = 0; i < 1_000_000; i++) {
    const salt = padHex(numberToHex(i), { size: 32 });
    const hookAddress = getCreate2Address({
      from: CREATE2_DEPLOYER,
      salt,
      bytecode: initCode,
    });

    if ((BigInt(hookAddress) & HOOK_MASK) === BEFORE_SWAP_FLAG) {
      return { salt, hookAddress };
    }
  }

  throw new Error("Could not mine a hook salt with the BEFORE_SWAP flag");
}

function sortAddresses(a: Address, b: Address): [Address, Address] {
  return BigInt(a) < BigInt(b) ? [a, b] : [b, a];
}

function explorerBaseUrl(chainId: number): string | undefined {
  return chainId === 196 ? XLAYER_MAINNET_EXPLORER : undefined;
}

async function waitForSuccess(hash: Hex, label: string) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`${label} status: ${receipt.status}`);
  console.log(`${label} gas used: ${receipt.gasUsed}`);

  if (receipt.status !== "success") {
    throw new Error(`${label} transaction reverted: ${hash}`);
  }

  return receipt;
}

const connection = await network.create();
const { viem } = connection;
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();

if (deployer?.account === undefined) {
  throw new Error("No deployer account. Set DEPLOYER_PRIVATE_KEY in your local .env file.");
}

const chainId = await publicClient.getChainId();
const deployerAddress = deployer.account.address;
const riskOracle = optionalAddress(process.env.RISK_ORACLE_ADDRESS, deployerAddress);
const useMockPoolManager = process.env.USE_MOCK_POOL_MANAGER === "true";
const deployHarness = process.env.DEPLOY_HARNESS === "true";
const hookDeployGasLimit = optionalBigInt(process.env.HOOK_DEPLOY_GAS_LIMIT, DEFAULT_HOOK_DEPLOY_GAS_LIMIT);

console.log(`Network: ${connection.networkName} (${chainId})`);
console.log(`Deployer: ${deployerAddress}`);
console.log(`Risk oracle: ${riskOracle}`);

let poolManagerAddress: Address;
let mockPoolManagerAddress: Address | undefined;

if (useMockPoolManager) {
  const mockPoolManager = await viem.deployContract("MockPoolManager");
  poolManagerAddress = mockPoolManager.address;
  mockPoolManagerAddress = mockPoolManager.address;
  console.log(`MockPoolManager: ${poolManagerAddress}`);
} else {
  const defaultPoolManager =
    chainId === 196 ? DEFAULT_XLAYER_MAINNET_POOL_MANAGER : undefined;
  poolManagerAddress = requiredAddress(
    process.env.POOL_MANAGER_ADDRESS ?? defaultPoolManager,
    "POOL_MANAGER_ADDRESS",
  );
  console.log(`PoolManager: ${poolManagerAddress}`);
}

let hookAddress: Address;
let hookDeploymentTx: Hex | undefined;
let minedSalt: Hex | undefined;
let hookCodeBytes: number | undefined;

if (deployHarness) {
  const hook = await viem.deployContract("NarrativeGuardHookHarness", [
    poolManagerAddress,
    riskOracle,
    deployerAddress,
  ]);
  hookAddress = hook.address;
  console.log(`NarrativeGuardHookHarness: ${hookAddress}`);
} else {
  const artifact = (await hre.artifacts.readArtifact("NarrativeGuardHook")) as Artifact;
  const initCode = encodeDeployData({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [poolManagerAddress, riskOracle, deployerAddress],
  });

  const mined = mineHookSalt(initCode);
  minedSalt = mined.salt;
  hookAddress = mined.hookAddress;

  const existingHookCode = await publicClient.getCode({ address: hookAddress });
  if (existingHookCode === undefined || existingHookCode === "0x") {
    const create2Code = await publicClient.getCode({ address: CREATE2_DEPLOYER });
    if (create2Code === undefined || create2Code === "0x") {
      throw new Error(
        `CREATE2 deployer ${CREATE2_DEPLOYER} is not available on this network. ` +
          "For local demos set DEPLOY_HARNESS=true, or deploy a CREATE2 factory first.",
      );
    }

    console.log(`Mined hook address: ${hookAddress}`);
    console.log(`CREATE2 salt: ${minedSalt}`);
    console.log(`Hook deploy gas limit: ${hookDeployGasLimit}`);

    hookDeploymentTx = await deployer.sendTransaction({
      to: CREATE2_DEPLOYER,
      data: concatHex([minedSalt, initCode]),
      gas: hookDeployGasLimit,
    });
    console.log(`Hook deployment tx: ${hookDeploymentTx}`);
    await waitForSuccess(hookDeploymentTx, "Hook deployment");
  } else {
    console.log(`Hook already deployed at ${hookAddress}`);
  }

  const deployedCode = await publicClient.getCode({ address: hookAddress });
  if (deployedCode === undefined || deployedCode === "0x") {
    throw new Error("Hook deployment transaction mined but no code was found at the mined address");
  }
  hookCodeBytes = (deployedCode.length - 2) / 2;
  console.log(`Hook code bytes: ${hookCodeBytes}`);
}

const hookContractName = deployHarness ? "NarrativeGuardHookHarness" : "NarrativeGuardHook";
const hook = await viem.getContractAt(hookContractName, hookAddress);

let demoToken0: Address | undefined;
let demoToken1: Address | undefined;
let poolId: Hex | undefined;
let configurePoolTx: Hex | undefined;
let initializePoolTx: Hex | undefined;

if (process.env.DEPLOY_DEMO_TOKENS === "true") {
  const meme = await viem.deployContract("DemoMemeToken", [
    "NarrativeGuard Meme",
    "NGM",
    deployerAddress,
  ]);
  const quote = await viem.deployContract("DemoMemeToken", [
    "Demo OKB",
    "dOKB",
    deployerAddress,
  ]);
  [demoToken0, demoToken1] = sortAddresses(meme.address, quote.address);
  console.log(`Demo token0: ${demoToken0}`);
  console.log(`Demo token1: ${demoToken1}`);
}

const envCurrency0 =
  process.env.DEMO_CURRENCY0 === undefined
    ? undefined
    : requiredAddress(process.env.DEMO_CURRENCY0, "DEMO_CURRENCY0");
const envCurrency1 =
  process.env.DEMO_CURRENCY1 === undefined
    ? undefined
    : requiredAddress(process.env.DEMO_CURRENCY1, "DEMO_CURRENCY1");

if (envCurrency0 !== undefined && envCurrency1 !== undefined) {
  [demoToken0, demoToken1] = sortAddresses(envCurrency0, envCurrency1);
}

if (process.env.CONFIGURE_DEMO_POOL === "true") {
  if (demoToken0 === undefined || demoToken1 === undefined) {
    throw new Error("CONFIGURE_DEMO_POOL=true requires DEMO_CURRENCY0/1 or DEPLOY_DEMO_TOKENS=true");
  }

  const poolKey = {
    currency0: demoToken0,
    currency1: demoToken1,
    fee: DYNAMIC_FEE_FLAG,
    tickSpacing: 60,
    hooks: hookAddress,
  } as const;

  configurePoolTx = await hook.write.configurePool([
    poolKey,
    {
      enabled: true,
      paused: false,
      riskScoreBps: 6_500,
      antiSnipeRiskBps: 8_000,
      baseFeePips: 3_000,
      maxFeePips: 100_000,
      maxTradeSize: 10_000n * 10n ** 18n,
      cooldownSeconds: 45,
      antiSnipeSeconds: 900,
      launchTimestamp: 0n,
      narrativeHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
    },
  ]);
  await waitForSuccess(configurePoolTx, "Configure pool");
  poolId = (await hook.read.getPoolId([poolKey])) as Hex;
  console.log(`Configured demo pool: ${poolId}`);

  if (process.env.INITIALIZE_V4_POOL === "true") {
    if (useMockPoolManager) {
      console.log("Skipped PoolManager.initialize because USE_MOCK_POOL_MANAGER=true");
    } else {
      const poolManager = getContract({
        address: poolManagerAddress,
        abi: poolManagerAbi,
        client: { public: publicClient, wallet: deployer },
      });

      initializePoolTx = await poolManager.write.initialize([
        poolKey,
        SQRT_PRICE_1_TO_1,
      ]);
      await waitForSuccess(initializePoolTx, "Initialize v4 pool");
      console.log(`Initialized v4 pool: ${poolId}`);
    }
  }
}

const explorer = explorerBaseUrl(chainId);
const deployment = {
  network: connection.networkName,
  chainId,
  deployer: deployerAddress,
  riskOracle,
  poolManager: poolManagerAddress,
  mockPoolManager: mockPoolManagerAddress,
  hook: hookAddress,
  hookContractName,
  hookFlags: "BEFORE_SWAP",
  create2Deployer: deployHarness ? undefined : CREATE2_DEPLOYER,
  create2Salt: minedSalt,
  hookDeploymentTx,
  hookCodeBytes,
  demoToken0,
  demoToken1,
  poolId,
  configurePoolTx,
  initializePoolTx,
  explorer,
  links: explorer
    ? {
        deployer: `${explorer}/address/${deployerAddress}`,
        riskOracle: `${explorer}/address/${riskOracle}`,
        poolManager: `${explorer}/address/${poolManagerAddress}`,
        hook: `${explorer}/address/${hookAddress}`,
        demoToken0: demoToken0 ? `${explorer}/address/${demoToken0}` : undefined,
        demoToken1: demoToken1 ? `${explorer}/address/${demoToken1}` : undefined,
        hookDeploymentTx: hookDeploymentTx ? `${explorer}/tx/${hookDeploymentTx}` : undefined,
        configurePoolTx: configurePoolTx ? `${explorer}/tx/${configurePoolTx}` : undefined,
        initializePoolTx: initializePoolTx ? `${explorer}/tx/${initializePoolTx}` : undefined,
      }
    : undefined,
  timestamp: new Date().toISOString(),
};

await mkdir("deployments", { recursive: true });
const deploymentFile = path.join(
  "deployments",
  connection.networkName.startsWith("hardhat")
    ? `${connection.networkName}.local.json`
    : `${connection.networkName}.json`,
);
await writeFile(deploymentFile, `${JSON.stringify(deployment, null, 2)}\n`);
console.log(`Wrote ${deploymentFile}`);
