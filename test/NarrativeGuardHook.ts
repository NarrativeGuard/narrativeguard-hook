import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { concatHex, encodeAbiParameters, parseAbiParameters, zeroAddress, zeroHash } from "viem";

const DYNAMIC_FEE_FLAG = 0x800000;
const OVERRIDE_FEE_FLAG = 0x400000;
const BEFORE_SWAP_SELECTOR = "0x575e24b4";

const token0 = "0x0000000000000000000000000000000000001000";
const token1 = "0x0000000000000000000000000000000000002000";

describe("NarrativeGuardHook", async function () {
  const { viem } = await network.create();

  async function deployFixture() {
    const [owner, oracle, trader, router] = await viem.getWalletClients();
    const manager = await viem.deployContract("MockPoolManager");
    const hook = await viem.deployContract("NarrativeGuardHookHarness", [
      manager.address,
      oracle.account.address,
      owner.account.address,
    ]);

    const key = {
      currency0: token0,
      currency1: token1,
      fee: DYNAMIC_FEE_FLAG,
      tickSpacing: 60,
      hooks: hook.address,
    } as const;

    return { owner, oracle, trader, router, manager, hook, key };
  }

  function config(overrides: Record<string, unknown> = {}) {
    return {
      enabled: true,
      paused: false,
      riskScoreBps: 5_000,
      antiSnipeRiskBps: 8_000,
      baseFeePips: 3_000,
      maxFeePips: 50_000,
      maxTradeSize: 1_000n,
      cooldownSeconds: 0,
      antiSnipeSeconds: 0,
      launchTimestamp: 0n,
      narrativeHash: zeroHash,
      ...overrides,
    };
  }

  const smallSwap = {
    zeroForOne: true,
    amountSpecified: -100n,
    sqrtPriceLimitX96: 0n,
  } as const;

  it("returns a risk-adjusted LP fee override for dynamic-fee pools", async function () {
    const { trader, manager, hook, key } = await deployFixture();
    await hook.write.configurePool([key, config()]);

    const { result } = await manager.simulate.callBeforeSwap([
      hook.address,
      trader.account.address,
      key,
      smallSwap,
      "0x",
    ]);

    assert.equal(result[0], BEFORE_SWAP_SELECTOR);
    assert.equal(result[1], 0n);
    assert.equal(result[2], OVERRIDE_FEE_FLAG + 26_500);
  });

  it("blocks oversized trades", async function () {
    const { trader, manager, hook, key } = await deployFixture();
    await hook.write.configurePool([key, config({ maxTradeSize: 99n })]);

    await assert.rejects(
      manager.simulate.callBeforeSwap([
        hook.address,
        trader.account.address,
        key,
        smallSwap,
        "0x",
      ]),
      /MaxTradeExceeded/,
    );
  });

  it("enforces trader cooldowns", async function () {
    const { trader, manager, hook, key } = await deployFixture();
    await hook.write.configurePool([key, config({ cooldownSeconds: 60 })]);

    await manager.write.callBeforeSwap([
      hook.address,
      trader.account.address,
      key,
      smallSwap,
      "0x",
    ]);

    await assert.rejects(
      manager.simulate.callBeforeSwap([
        hook.address,
        trader.account.address,
        key,
        smallSwap,
        "0x",
      ]),
      /CooldownActive/,
    );
  });

  it("blocks high-risk launch-window snipes but lets whitelisted traders through", async function () {
    const { trader, manager, hook, key } = await deployFixture();
    await hook.write.configurePool([
      key,
      config({
        riskScoreBps: 9_000,
        antiSnipeRiskBps: 8_000,
        antiSnipeSeconds: 3_600,
      }),
    ]);

    await assert.rejects(
      manager.simulate.callBeforeSwap([
        hook.address,
        trader.account.address,
        key,
        smallSwap,
        "0x",
      ]),
      /AntiSnipeActive/,
    );

    await hook.write.setGlobalListStatus([trader.account.address, true, false]);
    const { result } = await manager.simulate.callBeforeSwap([
      hook.address,
      trader.account.address,
      key,
      smallSwap,
      "0x",
    ]);
    assert.equal(result[0], BEFORE_SWAP_SELECTOR);
  });

  it("uses trusted router hookData to resolve the real trader", async function () {
    const { trader, router, manager, hook, key } = await deployFixture();
    await hook.write.configurePool([key, config({ cooldownSeconds: 60 })]);
    await hook.write.setTrustedRouter([router.account.address, true]);

    const hookData = concatHex([
      encodeAbiParameters(parseAbiParameters("address"), [
        trader.account.address,
      ]),
      "0x12345678",
    ]);

    await manager.write.callBeforeSwap([
      hook.address,
      router.account.address,
      key,
      smallSwap,
      hookData,
    ]);

    await assert.rejects(
      manager.simulate.callBeforeSwap([
        hook.address,
        router.account.address,
        key,
        smallSwap,
        hookData,
      ]),
      /CooldownActive/,
    );
  });

  it("allows the oracle to update narrative risk and pause a pool", async function () {
    const { oracle, trader, manager, hook, key } = await deployFixture();
    const publicClient = await viem.getPublicClient();
    const oracleHook = await viem.getContractAt("NarrativeGuardHookHarness", hook.address, {
      client: { public: publicClient, wallet: oracle },
    });

    await hook.write.configurePool([key, config()]);
    await oracleHook.write.updateNarrativeScore([
      key,
      7_500,
      "0x1111111111111111111111111111111111111111111111111111111111111111",
      "ipfs://narrative-risk/demo",
    ]);

    const fee = await hook.read.quoteFee([
      await hook.read.getPoolId([key]),
    ]);
    assert.equal(fee, 38_250);

    await oracleHook.write.setEmergencyPause([key, true]);
    await assert.rejects(
      manager.simulate.callBeforeSwap([
        hook.address,
        trader.account.address,
        key,
        smallSwap,
        "0x",
      ]),
      /GuardPaused/,
    );
  });

  it("validates configuration bounds before storing pool policy", async function () {
    const { hook, key } = await deployFixture();

    await assert.rejects(
      hook.write.configurePool([key, config({ riskScoreBps: 10_001 })]),
      /InvalidRiskScore/,
    );

    await assert.rejects(
      hook.write.configurePool([key, config({ baseFeePips: 50_000, maxFeePips: 3_000 })]),
      /InvalidFeeRange/,
    );

    await assert.rejects(
      hook.write.configurePool([
        key,
        config({
          launchTimestamp: 18_446_744_073_709_551_615n,
          antiSnipeSeconds: 1,
        }),
      ]),
      /InvalidTimeWindow/,
    );
  });

  it("keeps blacklist precedence above whitelist across global and pool lists", async function () {
    const { trader, manager, hook, key } = await deployFixture();
    await hook.write.configurePool([key, config()]);
    await hook.write.setGlobalListStatus([trader.account.address, true, false]);
    await hook.write.setPoolListStatus([key, trader.account.address, false, true]);

    await assert.rejects(
      manager.simulate.callBeforeSwap([
        hook.address,
        trader.account.address,
        key,
        smallSwap,
        "0x",
      ]),
      /TraderBlacklisted/,
    );
  });

  it("rejects malformed trusted-router hookData", async function () {
    const { router, manager, hook, key } = await deployFixture();
    await hook.write.configurePool([key, config()]);
    await hook.write.setTrustedRouter([router.account.address, true]);

    await assert.rejects(
      manager.simulate.callBeforeSwap([
        hook.address,
        router.account.address,
        key,
        smallSwap,
        "0x1234",
      ]),
      /InvalidHookData/,
    );

    const zeroTraderHookData = encodeAbiParameters(parseAbiParameters("address"), [
      zeroAddress,
    ]);
    await assert.rejects(
      manager.simulate.callBeforeSwap([
        hook.address,
        router.account.address,
        key,
        smallSwap,
        zeroTraderHookData,
      ]),
      /InvalidAccount/,
    );
  });

  it("rejects unsafe admin inputs for lists and trusted routers", async function () {
    const { trader, hook, key } = await deployFixture();

    await assert.rejects(
      hook.write.setGlobalListStatus([zeroAddress, true, false]),
      /InvalidAccount/,
    );

    await assert.rejects(
      hook.write.setGlobalListStatus([trader.account.address, true, true]),
      /InvalidListStatus/,
    );

    await assert.rejects(
      hook.write.setTrustedRouter([zeroAddress, true]),
      /InvalidTrustedRouter/,
    );

    await assert.rejects(
      hook.write.setGlobalListStatuses([[trader.account.address], [true], []]),
      /ArrayLengthMismatch/,
    );

    await assert.rejects(
      hook.write.setPoolListStatuses([key, [trader.account.address], [true], []]),
      /ArrayLengthMismatch/,
    );
  });

  it("screens static-fee pools without returning a dynamic fee override", async function () {
    const { trader, manager, hook } = await deployFixture();
    const staticFeeKey = {
      currency0: token0,
      currency1: token1,
      fee: 3_000,
      tickSpacing: 60,
      hooks: hook.address,
    } as const;
    await hook.write.configurePool([staticFeeKey, config()]);

    const { result } = await manager.simulate.callBeforeSwap([
      hook.address,
      trader.account.address,
      staticFeeKey,
      smallSwap,
      "0x",
    ]);

    assert.equal(result[0], BEFORE_SWAP_SELECTOR);
    assert.equal(result[2], 0);
  });

  it("fails open for attached but unconfigured pools", async function () {
    const { router, manager, hook, key } = await deployFixture();
    await hook.write.setTrustedRouter([router.account.address, true]);

    const { result } = await manager.simulate.callBeforeSwap([
      hook.address,
      router.account.address,
      key,
      smallSwap,
      "0x1234",
    ]);

    assert.equal(result[0], BEFORE_SWAP_SELECTOR);
    assert.equal(result[1], 0n);
    assert.equal(result[2], 0);
  });
});
