import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle,
  ExternalLink,
  Network,
  Pause,
  Play,
  RefreshCcw,
  Rocket,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import {
  concatHex,
  createPublicClient,
  createWalletClient,
  custom,
  encodeDeployData,
  getAddress,
  getContract,
  getCreate2Address,
  http,
  keccak256,
  numberToHex,
  padHex,
  toHex,
} from "viem";
import { contracts } from "./generated/contracts.js";

const CREATE2_DEPLOYER = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const HOOK_MASK = 0x3fffn;
const BEFORE_SWAP_FLAG = 0x80n;
const DYNAMIC_FEE_FLAG = 0x800000;
const SQRT_PRICE_1_TO_1 = 79228162514264337593543950336n;
const HOOK_DEPLOY_GAS_LIMIT = 15_000_000n;
const DEMO_TOKEN_DEPLOY_GAS_LIMIT = 3_000_000n;
const CONFIGURE_POOL_GAS_LIMIT = 500_000n;
const INITIALIZE_POOL_GAS_LIMIT = 900_000n;
const UPDATE_RISK_GAS_LIMIT = 250_000n;
const EMERGENCY_PAUSE_GAS_LIMIT = 200_000n;

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
];

const chains = {
  xlayerMainnet: {
    labelKey: "xlayerMainnet",
    defaultPoolManager: "0x360E68faccca8cA495c1B759Fd9EEe466db9FB32",
    explorer: "https://www.okx.com/web3/explorer/xlayer",
    chain: {
      id: 196,
      name: "X Layer Mainnet",
      nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
      rpcUrls: {
        default: { http: ["https://rpc.xlayer.tech"] },
        public: { http: ["https://rpc.xlayer.tech"] },
      },
      blockExplorers: {
        default: { name: "OKX Explorer", url: "https://www.okx.com/web3/explorer/xlayer" },
      },
    },
  },
};

const CURRENT_XLAYER_DEPLOYMENT = {
  poolManager: "0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32",
  hook: "0x86Ef9197Bde5Dd40352D0a58589b1772376B4080",
  demoToken0: "0x6213da9f111e2768fed4bf4875fa50001b7304ff",
  demoToken1: "0xb23f8a79e29113dc41e41cc75261713e5ffb1f0e",
  poolId: "0x57c6a64160f4f9fc82d32432ab6f242b52f28159e6ed882b024ebdf3ebf57bf1",
  riskOracle: "0xd87b33516ecb2ce135c1f99f5b5c8ec67cf235c4",
  configurePoolTx: "0xc18e335fe8d88c5d472485140dc9aeb667d91e981f543073916633711c4adac0",
  initializePoolTx: "0xaa1cb8472066987c4e5763faba214a69fe2450339abb340baef179ef71917a44",
};

function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function sortAddresses(a, b) {
  return BigInt(a) < BigInt(b) ? [a, b] : [b, a];
}

function addressUrl(networkKey, address) {
  return `${chains[networkKey].explorer}/address/${address}`;
}

function txUrl(networkKey, hash) {
  return `${chains[networkKey].explorer}/tx/${hash}`;
}

function ensureSuccess(receipt, label, t) {
  if (receipt.status !== "success") {
    throw new Error(t ? t("txReverted", { label }) : `${label} transaction reverted`);
  }
  return receipt;
}

function formatFeePips(feePips, pendingLabel = "Pending") {
  if (feePips === "") return pendingLabel;
  return `${(Number(feePips) / 10_000).toFixed(2)}%`;
}

function structField(value, name, index) {
  return value?.[name] ?? value?.[index];
}

function codeBytes(code) {
  return code && code !== "0x" ? (code.length - 2) / 2 : 0;
}

function eventLabel(eventName, t) {
  const labels = {
    PoolConfigured: "eventPoolConfigured",
    NarrativeScoreUpdated: "eventNarrativeScoreUpdated",
    EmergencyPauseSet: "eventEmergencyPauseSet",
    TradeScreened: "eventTradeScreened",
  };
  return t(labels[eventName] || eventName);
}

async function pauseBrowser() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function mineHookSalt(initCode, onProgress, t) {
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

    if (i % 5_000 === 0) {
      onProgress(t("logMiningSalt", { count: i.toLocaleString() }));
      await pauseBrowser();
    }
  }

  throw new Error(t("errMineSalt"));
}

export function DeployPanel({ t }) {
  const [networkKey, setNetworkKey] = useState("xlayerMainnet");
  const selected = chains[networkKey];
  const [walletAddress, setWalletAddress] = useState("");
  const [walletChainId, setWalletChainId] = useState("");
  const [poolManager, setPoolManager] = useState(selected.defaultPoolManager);
  const [riskOracle, setRiskOracle] = useState("");
  const [hookAddress, setHookAddress] = useState("");
  const [demoToken0, setDemoToken0] = useState("");
  const [demoToken1, setDemoToken1] = useState("");
  const [poolId, setPoolId] = useState("");
  const [liveRiskScore, setLiveRiskScore] = useState(6500);
  const [liveSourceURI, setLiveSourceURI] = useState("demo://narrativeguard/manual-update");
  const [livePaused, setLivePaused] = useState("");
  const [liveFeePips, setLiveFeePips] = useState("");
  const [configurePoolTx, setConfigurePoolTx] = useState("");
  const [initializePoolTx, setInitializePoolTx] = useState("");
  const [activityStats, setActivityStats] = useState({
    hookCodeBytes: "",
    poolManagerCodeBytes: "",
    configureStatus: "",
    initializeStatus: "",
    eventCount: "",
    eventIndexStatus: "",
  });
  const [activityRows, setActivityRows] = useState([]);
  const [status, setStatus] = useState(() => t("ready"));
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    setPoolManager(chains[networkKey].defaultPoolManager);
  }, [networkKey]);

  useEffect(() => {
    if (logs.length === 0) setStatus(t("ready"));
  }, [logs.length, t]);

  const connectedToTarget = Number(walletChainId) === selected.chain.id;

  const publicClient = useMemo(
    () => createPublicClient({ chain: selected.chain, transport: http(selected.chain.rpcUrls.default.http[0]) }),
    [selected],
  );

  function appendLog(message) {
    setLogs((current) => [`${new Date().toLocaleTimeString()} ${message}`, ...current].slice(0, 8));
    setStatus(message);
  }

  function clearActivity() {
    setActivityStats({
      hookCodeBytes: "",
      poolManagerCodeBytes: "",
      configureStatus: "",
      initializeStatus: "",
      eventCount: "",
      eventIndexStatus: "",
    });
    setActivityRows([]);
  }

  function clearDemoPoolState() {
    setDemoToken0("");
    setDemoToken1("");
    setPoolId("");
    setLivePaused("");
    setLiveFeePips("");
    setConfigurePoolTx("");
    setInitializePoolTx("");
    clearActivity();
  }

  async function getProvider() {
    if (!window.ethereum) {
      throw new Error(t("noWallet"));
    }
    return window.ethereum;
  }

  async function connectWallet() {
    setBusy(true);
    try {
      const provider = await getProvider();
      const [account] = await provider.request({ method: "eth_requestAccounts" });
      const chainIdHex = await provider.request({ method: "eth_chainId" });
      const accountAddress = getAddress(account);
      setWalletAddress(accountAddress);
      setRiskOracle((current) => current || accountAddress);
      setWalletChainId(String(Number(BigInt(chainIdHex))));
      appendLog(t("logWalletConnected", { address: shortAddress(accountAddress) }));
    } catch (error) {
      appendLog(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function switchNetwork() {
    setBusy(true);
    try {
      const provider = await getProvider();
      const chainId = numberToHex(selected.chain.id);
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId }],
        });
      } catch (error) {
        if (error.code !== 4902) throw error;
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId,
              chainName: selected.chain.name,
              nativeCurrency: selected.chain.nativeCurrency,
              rpcUrls: selected.chain.rpcUrls.default.http,
              blockExplorerUrls: [selected.explorer],
            },
          ],
        });
      }
      await connectWallet();
      appendLog(t("logNetworkReady", { network: t(selected.labelKey) }));
    } catch (error) {
      appendLog(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function getWalletClient() {
    const provider = await getProvider();
    const [account] = await provider.request({ method: "eth_requestAccounts" });
    const accountAddress = getAddress(account);
    return createWalletClient({
      account: accountAddress,
      chain: selected.chain,
      transport: custom(provider),
    });
  }

  async function ensureReady() {
    if (!walletAddress) await connectWallet();
    if (!connectedToTarget) await switchNetwork();
  }

  function loadCurrentDeployment() {
    setPoolManager(CURRENT_XLAYER_DEPLOYMENT.poolManager);
    setRiskOracle(CURRENT_XLAYER_DEPLOYMENT.riskOracle);
    setHookAddress(CURRENT_XLAYER_DEPLOYMENT.hook);
    setDemoToken0(CURRENT_XLAYER_DEPLOYMENT.demoToken0);
    setDemoToken1(CURRENT_XLAYER_DEPLOYMENT.demoToken1);
    setPoolId(CURRENT_XLAYER_DEPLOYMENT.poolId);
    setConfigurePoolTx(CURRENT_XLAYER_DEPLOYMENT.configurePoolTx);
    setInitializePoolTx(CURRENT_XLAYER_DEPLOYMENT.initializePoolTx);
    clearActivity();
    appendLog(t("logCurrentLoaded"));
  }

  function getPoolKey() {
    if (!hookAddress || !demoToken0 || !demoToken1) {
      throw new Error(t("errLoadDeploymentFirst"));
    }

    const [currency0, currency1] = sortAddresses(getAddress(demoToken0), getAddress(demoToken1));
    return {
      currency0,
      currency1,
      fee: DYNAMIC_FEE_FLAG,
      tickSpacing: 60,
      hooks: getAddress(hookAddress),
    };
  }

  function getReadHookContract() {
    if (!hookAddress) throw new Error(t("errHookMissing"));
    return getContract({
      address: getAddress(hookAddress),
      abi: contracts.NarrativeGuardHook.abi,
      client: publicClient,
    });
  }

  async function refreshLivePolicy() {
    setBusy(true);
    try {
      const key = getPoolKey();
      const hookContract = getReadHookContract();
      const nextPoolId = await hookContract.read.getPoolId([key]);
      const [config, quotedFee] = await Promise.all([
        hookContract.read.getConfig([nextPoolId]),
        hookContract.read.quoteFee([nextPoolId]),
      ]);

      setPoolId(nextPoolId);
      setLiveRiskScore(Number(structField(config, "riskScoreBps", 2)));
      setLivePaused(Boolean(structField(config, "paused", 1)));
      setLiveFeePips(Number(quotedFee));
      appendLog(t("logLivePolicyRefreshed", { fee: formatFeePips(quotedFee, t("pending")) }));
    } catch (error) {
      appendLog(error.shortMessage || error.message);
    } finally {
      setBusy(false);
    }
  }

  async function refreshOnchainActivity() {
    setBusy(true);
    try {
      const hook = getAddress(hookAddress || CURRENT_XLAYER_DEPLOYMENT.hook);
      const manager = getAddress(poolManager || CURRENT_XLAYER_DEPLOYMENT.poolManager);
      const isCurrentDeployment = hook.toLowerCase() === CURRENT_XLAYER_DEPLOYMENT.hook.toLowerCase();
      const effectiveConfigurePoolTx =
        configurePoolTx || (isCurrentDeployment ? CURRENT_XLAYER_DEPLOYMENT.configurePoolTx : "");
      const effectiveInitializePoolTx =
        initializePoolTx || (isCurrentDeployment ? CURRENT_XLAYER_DEPLOYMENT.initializePoolTx : "");

      const [hookCode, managerCode, configureReceipt, initializeReceipt] = await Promise.all([
        publicClient.getCode({ address: hook }),
        publicClient.getCode({ address: manager }),
        effectiveConfigurePoolTx
          ? publicClient.getTransactionReceipt({ hash: effectiveConfigurePoolTx })
          : Promise.resolve(undefined),
        effectiveInitializePoolTx
          ? publicClient.getTransactionReceipt({ hash: effectiveInitializePoolTx })
          : Promise.resolve(undefined),
      ]);

      const receiptBlocks = [configureReceipt?.blockNumber, initializeReceipt?.blockNumber].filter(
        (blockNumber) => blockNumber !== undefined,
      );
      const fromBlock =
        receiptBlocks.length > 0
          ? receiptBlocks.reduce((lowest, blockNumber) => (blockNumber < lowest ? blockNumber : lowest))
          : undefined;
      let hookEvents = [];
      let eventScanFailed = false;
      try {
        const eventNames = [
          "PoolConfigured",
          "NarrativeScoreUpdated",
          "EmergencyPauseSet",
          "TradeScreened",
        ];
        if (fromBlock !== undefined) {
          const eventGroups = await Promise.all(
            eventNames.map((eventName) =>
              publicClient.getContractEvents({
                address: hook,
                abi: contracts.NarrativeGuardHook.abi,
                eventName,
                fromBlock,
                toBlock: "latest",
              }),
            ),
          );
          hookEvents = eventGroups
            .flat()
            .sort((a, b) => Number((b.blockNumber ?? 0n) - (a.blockNumber ?? 0n)))
            .slice(0, 8);
        }
      } catch {
        eventScanFailed = true;
      }

      setActivityStats({
        hookCodeBytes: codeBytes(hookCode),
        poolManagerCodeBytes: codeBytes(managerCode),
        configureStatus: configureReceipt?.status ?? "",
        initializeStatus: initializeReceipt?.status ?? "",
        eventCount: hookEvents.length,
        eventIndexStatus: eventScanFailed ? "receipts" : "indexed",
      });
      setActivityRows([
        ...(configureReceipt
          ? [
              {
                kind: "tx",
                label: t("txConfigurePool"),
                detail: t("block"),
                value: configureReceipt.blockNumber.toString(),
                hash: effectiveConfigurePoolTx,
              },
            ]
          : []),
        ...(initializeReceipt
          ? [
              {
                kind: "tx",
                label: t("txInitializePool"),
                detail: t("block"),
                value: initializeReceipt.blockNumber.toString(),
                hash: effectiveInitializePoolTx,
              },
            ]
          : []),
        ...hookEvents.map((event) => ({
          kind: "event",
          label: eventLabel(event.eventName, t),
          detail: t("block"),
          value: event.blockNumber?.toString() ?? "",
          hash: event.transactionHash,
        })),
      ]);
      appendLog(
        eventScanFailed
          ? t("logActivityEventsUnavailable")
          : t("logActivityRefreshed", { count: hookEvents.length }),
      );
    } catch (error) {
      appendLog(error.shortMessage || error.message);
    } finally {
      setBusy(false);
    }
  }

  async function updateLiveRiskScore() {
    setBusy(true);
    try {
      await ensureReady();
      const walletClient = await getWalletClient();
      const key = getPoolKey();
      const sourceURI = liveSourceURI.trim() || "demo://narrativeguard/manual-update";
      const narrativeHash = keccak256(toHex(sourceURI));
      const hookContract = getContract({
        address: getAddress(hookAddress),
        abi: contracts.NarrativeGuardHook.abi,
        client: { public: publicClient, wallet: walletClient },
      });

      const hash = await hookContract.write.updateNarrativeScore([
        key,
        Number(liveRiskScore),
        narrativeHash,
        sourceURI,
      ], { gas: UPDATE_RISK_GAS_LIMIT });
      appendLog(t("logRiskUpdateSent", { hash }));
      ensureSuccess(await publicClient.waitForTransactionReceipt({ hash }), t("riskUpdate"), t);
      await refreshLivePolicy();
    } catch (error) {
      appendLog(error.shortMessage || error.message);
    } finally {
      setBusy(false);
    }
  }

  async function setLiveEmergencyPause(nextPaused) {
    setBusy(true);
    try {
      await ensureReady();
      const walletClient = await getWalletClient();
      const key = getPoolKey();
      const hookContract = getContract({
        address: getAddress(hookAddress),
        abi: contracts.NarrativeGuardHook.abi,
        client: { public: publicClient, wallet: walletClient },
      });

      const hash = await hookContract.write.setEmergencyPause([key, nextPaused], { gas: EMERGENCY_PAUSE_GAS_LIMIT });
      appendLog(t("logPauseSent", { action: nextPaused ? t("pauseAction") : t("resumeAction"), hash }));
      ensureSuccess(await publicClient.waitForTransactionReceipt({ hash }), t("emergencyPauseTx"), t);
      await refreshLivePolicy();
    } catch (error) {
      appendLog(error.shortMessage || error.message);
    } finally {
      setBusy(false);
    }
  }

  async function deployHook() {
    setBusy(true);
    try {
      await ensureReady();
      const walletClient = await getWalletClient();
      const owner = walletClient.account.address;
      const manager = getAddress(poolManager);
      const oracle = getAddress(riskOracle || owner);
      const initCode = encodeDeployData({
        abi: contracts.NarrativeGuardHook.abi,
        bytecode: contracts.NarrativeGuardHook.bytecode,
        args: [manager, oracle, owner],
      });

      const { salt, hookAddress: minedHookAddress } = await mineHookSalt(initCode, appendLog, t);
      setHookAddress(minedHookAddress);
      clearDemoPoolState();
      appendLog(t("logHookAddressMined", { address: shortAddress(minedHookAddress) }));

      const factoryCode = await publicClient.getCode({ address: CREATE2_DEPLOYER });
      if (!factoryCode || factoryCode === "0x") {
        throw new Error(t("errCreate2Unavailable"));
      }

      const existingHookCode = await publicClient.getCode({ address: minedHookAddress });
      if (existingHookCode && existingHookCode !== "0x") {
        appendLog(t("logHookAlreadyDeployed"));
        return;
      }

      const hash = await walletClient.sendTransaction({
        to: CREATE2_DEPLOYER,
        data: concatHex([salt, initCode]),
        gas: HOOK_DEPLOY_GAS_LIMIT,
      });
      appendLog(t("logHookDeploymentSent", { hash }));
      ensureSuccess(await publicClient.waitForTransactionReceipt({ hash }), t("hookDeployment"), t);
      const hookCode = await publicClient.getCode({ address: minedHookAddress });
      if (!hookCode || hookCode === "0x") {
        throw new Error(t("errHookNoCode"));
      }
      appendLog(t("logHookDeployed", { address: shortAddress(minedHookAddress) }));
    } catch (error) {
      appendLog(error.shortMessage || error.message);
    } finally {
      setBusy(false);
    }
  }

  async function deployDemoPool() {
    setBusy(true);
    try {
      await ensureReady();
      const walletClient = await getWalletClient();
      const owner = walletClient.account.address;
      const manager = getAddress(poolManager);
      const hook = getAddress(hookAddress);

      appendLog(t("logDeployMeme"));
      const memeHash = await walletClient.deployContract({
        abi: contracts.DemoMemeToken.abi,
        bytecode: contracts.DemoMemeToken.bytecode,
        args: ["NarrativeGuard Meme", "NGM", owner],
        gas: DEMO_TOKEN_DEPLOY_GAS_LIMIT,
      });
      const memeReceipt = ensureSuccess(await publicClient.waitForTransactionReceipt({ hash: memeHash }), t("memeToken"), t);
      const meme = memeReceipt.contractAddress;
      if (!meme) throw new Error(t("errMemeNoAddress"));

      appendLog(t("logDeployQuote"));
      const quoteHash = await walletClient.deployContract({
        abi: contracts.DemoMemeToken.abi,
        bytecode: contracts.DemoMemeToken.bytecode,
        args: ["Demo OKB", "dOKB", owner],
        gas: DEMO_TOKEN_DEPLOY_GAS_LIMIT,
      });
      const quoteReceipt = ensureSuccess(await publicClient.waitForTransactionReceipt({ hash: quoteHash }), t("quoteToken"), t);
      const quote = quoteReceipt.contractAddress;
      if (!quote) throw new Error(t("errQuoteNoAddress"));

      const [currency0, currency1] = sortAddresses(getAddress(meme), getAddress(quote));
      setDemoToken0(currency0);
      setDemoToken1(currency1);
      appendLog(t("logTokensSorted"));

      const key = {
        currency0,
        currency1,
        fee: DYNAMIC_FEE_FLAG,
        tickSpacing: 60,
        hooks: hook,
      };

      const hookContract = getContract({
        address: hook,
        abi: contracts.NarrativeGuardHook.abi,
        client: { public: publicClient, wallet: walletClient },
      });

      appendLog(t("logConfiguringPolicy"));
      const configureHash = await hookContract.write.configurePool([
        key,
        {
          enabled: true,
          paused: false,
          riskScoreBps: 6500,
          antiSnipeRiskBps: 8000,
          baseFeePips: 3000,
          maxFeePips: 100000,
          maxTradeSize: 10_000n * 10n ** 18n,
          cooldownSeconds: 45,
          antiSnipeSeconds: 900,
          launchTimestamp: 0n,
          narrativeHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
        },
      ], { gas: CONFIGURE_POOL_GAS_LIMIT });
      setConfigurePoolTx(configureHash);
      ensureSuccess(await publicClient.waitForTransactionReceipt({ hash: configureHash }), t("configurePool"), t);

      const nextPoolId = await hookContract.read.getPoolId([key]);
      setPoolId(nextPoolId);

      const managerContract = getContract({
        address: manager,
        abi: poolManagerAbi,
        client: { public: publicClient, wallet: walletClient },
      });

      appendLog(t("logInitializingPool"));
      const initializeHash = await managerContract.write.initialize([key, SQRT_PRICE_1_TO_1], {
        gas: INITIALIZE_POOL_GAS_LIMIT,
      });
      setInitializePoolTx(initializeHash);
      ensureSuccess(await publicClient.waitForTransactionReceipt({ hash: initializeHash }), t("initializePool"), t);
      appendLog(t("logPoolInitialized", { poolId: `${nextPoolId.slice(0, 10)}...` }));
    } catch (error) {
      appendLog(error.shortMessage || error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="deploy-band">
      <div className="deploy-heading">
        <div>
          <p className="eyebrow">{t("deployEyebrow")}</p>
          <h2>{t("deployTitle")}</h2>
        </div>
        <ShieldCheck size={22} />
      </div>

      <div className="deploy-grid">
        <label className="field">
          <span>{t("network")}</span>
          <select value={networkKey} onChange={(event) => setNetworkKey(event.target.value)}>
            {Object.entries(chains).map(([key, value]) => (
              <option value={key} key={key}>
                {t(value.labelKey)}
              </option>
            ))}
          </select>
        </label>

        <label className="field wide">
          <span>{t("poolManager")}</span>
          <input value={poolManager} onChange={(event) => setPoolManager(event.target.value)} placeholder="0x..." />
        </label>

        <label className="field wide">
          <span>{t("riskOracle")}</span>
          <input value={riskOracle} onChange={(event) => setRiskOracle(event.target.value)} placeholder={t("riskOraclePlaceholder")} />
        </label>

        <div className="wallet-card">
          <div>
            <span>{t("wallet")}</span>
            <strong>{walletAddress ? shortAddress(walletAddress) : t("notConnected")}</strong>
          </div>
          <div>
            <span>{t("chain")}</span>
            <strong className={connectedToTarget ? "ok-text" : "warn-text"}>
              {walletChainId || "n/a"}
            </strong>
          </div>
        </div>
      </div>

      <div className="deploy-actions">
        <button onClick={connectWallet} disabled={busy}>
          <Wallet size={18} />
          {t("connect")}
        </button>
        <button onClick={switchNetwork} disabled={busy}>
          <Network size={18} />
          {t("switchAdd")}
        </button>
        <button onClick={loadCurrentDeployment} disabled={busy}>
          <CheckCircle size={18} />
          {t("loadCurrent")}
        </button>
        <button onClick={deployHook} disabled={busy || !poolManager}>
          <Rocket size={18} />
          {t("deployHook")}
        </button>
        <button onClick={deployDemoPool} disabled={busy || !hookAddress || !poolManager}>
          <CheckCircle size={18} />
          {t("initDemoPool")}
        </button>
      </div>

      <div className="deploy-results">
        <ResultLink networkKey={networkKey} label={t("hook")} address={hookAddress} t={t} />
        <ResultLink networkKey={networkKey} label={t("token0")} address={demoToken0} t={t} />
        <ResultLink networkKey={networkKey} label={t("token1")} address={demoToken1} t={t} />
        <div className="result-row">
          <span>PoolId</span>
          <strong>{poolId ? `${poolId.slice(0, 12)}...${poolId.slice(-8)}` : t("pending")}</strong>
        </div>
      </div>

      <div className="live-controls">
        <div className="deploy-heading">
          <div>
            <p className="eyebrow">{t("liveControlsEyebrow")}</p>
            <h2>{t("liveControlsTitle")}</h2>
          </div>
          <ShieldCheck size={22} />
        </div>

        <div className="live-grid">
          <label className="field">
            <span>{t("riskScoreBps")}</span>
            <input
              type="number"
              min="0"
              max="10000"
              value={liveRiskScore}
              onChange={(event) => setLiveRiskScore(Math.max(0, Math.min(10_000, Number(event.target.value))))}
            />
          </label>
          <label className="field wide">
            <span>{t("sourceURI")}</span>
            <input value={liveSourceURI} onChange={(event) => setLiveSourceURI(event.target.value)} />
          </label>
          <div className="result-row">
            <span>{t("liveFee")}</span>
            <strong>{formatFeePips(liveFeePips, t("pending"))}</strong>
          </div>
          <div className="result-row">
            <span>{t("pause")}</span>
            <strong className={livePaused === true ? "warn-text" : "ok-text"}>
              {livePaused === "" ? t("unknown") : livePaused ? t("on") : t("off")}
            </strong>
          </div>
        </div>

        <div className="deploy-actions">
          <button onClick={refreshLivePolicy} disabled={busy || !hookAddress || !demoToken0 || !demoToken1}>
            <RefreshCcw size={18} />
            {t("refreshOnchain")}
          </button>
          <button onClick={updateLiveRiskScore} disabled={busy || !hookAddress || !demoToken0 || !demoToken1}>
            <Rocket size={18} />
            {t("updateScore")}
          </button>
          <button onClick={() => setLiveEmergencyPause(true)} disabled={busy || !hookAddress || !demoToken0 || !demoToken1}>
            <Pause size={18} />
            {t("pause")}
          </button>
          <button onClick={() => setLiveEmergencyPause(false)} disabled={busy || !hookAddress || !demoToken0 || !demoToken1}>
            <Play size={18} />
            {t("resume")}
          </button>
        </div>
      </div>

      <div className="deploy-log">
        <strong>{status}</strong>
        {logs.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </div>

      <div className="activity-panel">
        <div className="deploy-heading">
          <div>
            <p className="eyebrow">{t("activityEyebrow")}</p>
            <h2>{t("activityTitle")}</h2>
          </div>
          <button className="mini-button" onClick={refreshOnchainActivity} disabled={busy}>
            <RefreshCcw size={16} />
            {t("refreshActivity")}
          </button>
        </div>

        <div className="activity-stats">
          <Stat label={t("hookCode")} value={activityStats.hookCodeBytes === "" ? t("pending") : t("bytes", { count: activityStats.hookCodeBytes })} />
          <Stat label={t("poolManagerCode")} value={activityStats.poolManagerCodeBytes === "" ? t("pending") : t("bytes", { count: activityStats.poolManagerCodeBytes })} />
          <Stat label={t("configTx")} value={activityStats.configureStatus ? t("success") : t("pending")} />
          <Stat label={t("initTx")} value={activityStats.initializeStatus ? t("success") : t("pending")} />
          <Stat
            label={t("eventIndex")}
            value={
              activityStats.eventIndexStatus === "receipts"
                ? t("eventIndexReceiptsVerified")
                : activityStats.eventCount === ""
                  ? t("pending")
                  : t("eventsCount", { count: activityStats.eventCount })
            }
          />
        </div>

        <div className="activity-list">
          {activityRows.length === 0 ? (
            <div className="activity-empty">{t("noEvents")}</div>
          ) : (
            activityRows.map((row, index) => (
              <a
                className="activity-row"
                href={txUrl(networkKey, row.hash)}
                target="_blank"
                rel="noreferrer"
                key={`${row.hash}-${index}`}
              >
                <span>{row.label}</span>
                <strong>{row.detail} {row.value}</strong>
                <ExternalLink size={14} />
              </a>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ResultLink({ networkKey, label, address, t }) {
  return (
    <div className="result-row">
      <span>{label}</span>
      {address ? (
        <a href={addressUrl(networkKey, address)} target="_blank" rel="noreferrer">
          {shortAddress(address)}
          <ExternalLink size={14} />
        </a>
      ) : (
        <strong>{t("pending")}</strong>
      )}
    </div>
  );
}
