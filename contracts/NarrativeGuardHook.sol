// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "@uniswap/v4-periphery/lib/v4-core/src/libraries/Hooks.sol";
import {IHooks} from "@uniswap/v4-periphery/lib/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-periphery/lib/v4-core/src/interfaces/IPoolManager.sol";
import {LPFeeLibrary} from "@uniswap/v4-periphery/lib/v4-core/src/libraries/LPFeeLibrary.sol";
import {PoolKey} from "@uniswap/v4-periphery/lib/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-periphery/lib/v4-core/src/types/PoolId.sol";
import {
    BeforeSwapDelta,
    BeforeSwapDeltaLibrary
} from "@uniswap/v4-periphery/lib/v4-core/src/types/BeforeSwapDelta.sol";
import {SwapParams} from "@uniswap/v4-periphery/lib/v4-core/src/types/PoolOperation.sol";

/// @title NarrativeGuardHook
/// @notice A Uniswap v4 hook that gates meme-token swaps with offchain narrative risk signals.
contract NarrativeGuardHook is BaseHook, Ownable {
    using LPFeeLibrary for uint24;
    using PoolIdLibrary for PoolKey;

    uint16 public constant MAX_RISK_BPS = 10_000;
    uint160 public constant HOOK_FLAGS = Hooks.BEFORE_SWAP_FLAG;

    enum Decision {
        Allowed,
        Disabled,
        Paused,
        Blacklisted,
        AntiSnipe,
        MaxTrade,
        Cooldown
    }

    struct GuardConfig {
        bool enabled;
        bool paused;
        uint16 riskScoreBps;
        uint16 antiSnipeRiskBps;
        uint24 baseFeePips;
        uint24 maxFeePips;
        uint128 maxTradeSize;
        uint32 cooldownSeconds;
        uint32 antiSnipeSeconds;
        uint64 launchTimestamp;
        bytes32 narrativeHash;
    }

    struct TradePreview {
        Decision decision;
        address trader;
        uint256 tradeSize;
        uint24 feePips;
        uint64 nextAllowedAt;
        uint16 riskScoreBps;
        bool whitelisted;
        bool blacklisted;
    }

    address public riskOracle;

    mapping(PoolId poolId => GuardConfig config) private _configs;
    mapping(address account => bool listed) public globalWhitelist;
    mapping(address account => bool listed) public globalBlacklist;
    mapping(address router => bool trusted) public trustedRouter;
    mapping(PoolId poolId => mapping(address account => bool listed)) private _poolWhitelist;
    mapping(PoolId poolId => mapping(address account => bool listed)) private _poolBlacklist;
    mapping(PoolId poolId => mapping(address trader => uint64 timestamp)) public lastSwapAt;

    event RiskOracleUpdated(address indexed oldOracle, address indexed newOracle);
    event PoolConfigured(PoolId indexed poolId, GuardConfig config);
    event NarrativeScoreUpdated(
        PoolId indexed poolId, uint16 riskScoreBps, bytes32 narrativeHash, string sourceURI
    );
    event EmergencyPauseSet(PoolId indexed poolId, bool paused);
    event GlobalListUpdated(address indexed account, bool whitelisted, bool blacklisted);
    event PoolListUpdated(PoolId indexed poolId, address indexed account, bool whitelisted, bool blacklisted);
    event TrustedRouterUpdated(address indexed router, bool trusted);
    event TradeScreened(
        PoolId indexed poolId,
        address indexed trader,
        int256 amountSpecified,
        uint24 feePips,
        uint16 riskScoreBps
    );

    error NotRiskOracle();
    error HookPoolMismatch(address expectedHook, address actualHook);
    error InvalidRiskScore(uint16 riskScoreBps);
    error InvalidFeeRange(uint24 baseFeePips, uint24 maxFeePips);
    error InvalidListStatus();
    error InvalidAccount();
    error InvalidHookData(address router, uint256 length);
    error InvalidOracle();
    error InvalidTrustedRouter();
    error InvalidTimeWindow(uint64 launchTimestamp, uint32 antiSnipeSeconds);
    error ArrayLengthMismatch();
    error GuardPaused(PoolId poolId);
    error TraderBlacklisted(PoolId poolId, address trader);
    error AntiSnipeActive(PoolId poolId, uint64 untilTimestamp, uint16 riskScoreBps);
    error MaxTradeExceeded(PoolId poolId, uint256 tradeSize, uint128 maxTradeSize);
    error CooldownActive(PoolId poolId, address trader, uint64 nextAllowedAt);
    error AmountOverflow();

    modifier onlyOwnerOrOracle() {
        if (msg.sender != owner() && msg.sender != riskOracle) revert NotRiskOracle();
        _;
    }

    constructor(IPoolManager manager, address initialRiskOracle, address initialOwner)
        BaseHook(manager)
        Ownable(initialOwner)
    {
        if (initialRiskOracle == address(0)) revert InvalidOracle();
        riskOracle = initialRiskOracle;
        emit RiskOracleUpdated(address(0), initialRiskOracle);
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: false,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function getPoolId(PoolKey calldata key) external pure returns (PoolId) {
        return key.toId();
    }

    function getConfig(PoolId poolId) external view returns (GuardConfig memory) {
        return _configs[poolId];
    }

    function isPoolWhitelisted(PoolId poolId, address account) external view returns (bool) {
        return _poolWhitelist[poolId][account];
    }

    function isPoolBlacklisted(PoolId poolId, address account) external view returns (bool) {
        return _poolBlacklist[poolId][account];
    }

    function setRiskOracle(address newRiskOracle) external onlyOwner {
        if (newRiskOracle == address(0)) revert InvalidOracle();
        address oldOracle = riskOracle;
        riskOracle = newRiskOracle;
        emit RiskOracleUpdated(oldOracle, newRiskOracle);
    }

    function configurePool(PoolKey calldata key, GuardConfig calldata config) external onlyOwner {
        _assertHookKey(key);
        _validateConfig(config);

        GuardConfig memory nextConfig = config;
        if (nextConfig.enabled && nextConfig.launchTimestamp == 0) {
            nextConfig.launchTimestamp = uint64(block.timestamp);
        }

        PoolId id = key.toId();
        _configs[id] = nextConfig;
        emit PoolConfigured(id, nextConfig);
    }

    function updateNarrativeScore(
        PoolKey calldata key,
        uint16 riskScoreBps,
        bytes32 narrativeHash,
        string calldata sourceURI
    ) external onlyOwnerOrOracle {
        _assertHookKey(key);
        if (riskScoreBps > MAX_RISK_BPS) revert InvalidRiskScore(riskScoreBps);

        PoolId id = key.toId();
        GuardConfig storage config = _configs[id];
        config.riskScoreBps = riskScoreBps;
        config.narrativeHash = narrativeHash;

        emit NarrativeScoreUpdated(id, riskScoreBps, narrativeHash, sourceURI);
    }

    function setEmergencyPause(PoolKey calldata key, bool paused) external onlyOwnerOrOracle {
        _assertHookKey(key);
        PoolId id = key.toId();
        _configs[id].paused = paused;
        emit EmergencyPauseSet(id, paused);
    }

    function setGlobalListStatus(address account, bool whitelisted, bool blacklisted) external onlyOwner {
        _setGlobalListStatus(account, whitelisted, blacklisted);
    }

    function setGlobalListStatuses(address[] calldata accounts, bool[] calldata whitelisted, bool[] calldata blacklisted)
        external
        onlyOwner
    {
        if (accounts.length != whitelisted.length || accounts.length != blacklisted.length) {
            revert ArrayLengthMismatch();
        }

        for (uint256 i; i < accounts.length; i++) {
            _setGlobalListStatus(accounts[i], whitelisted[i], blacklisted[i]);
        }
    }

    function setPoolListStatus(PoolKey calldata key, address account, bool whitelisted, bool blacklisted)
        external
        onlyOwner
    {
        _assertHookKey(key);
        PoolId id = key.toId();
        _setPoolListStatus(id, account, whitelisted, blacklisted);
    }

    function setPoolListStatuses(
        PoolKey calldata key,
        address[] calldata accounts,
        bool[] calldata whitelisted,
        bool[] calldata blacklisted
    ) external onlyOwner {
        _assertHookKey(key);
        if (accounts.length != whitelisted.length || accounts.length != blacklisted.length) {
            revert ArrayLengthMismatch();
        }

        PoolId id = key.toId();
        for (uint256 i; i < accounts.length; i++) {
            _setPoolListStatus(id, accounts[i], whitelisted[i], blacklisted[i]);
        }
    }

    function setTrustedRouter(address router, bool trusted) external onlyOwner {
        if (router == address(0)) revert InvalidTrustedRouter();
        trustedRouter[router] = trusted;
        emit TrustedRouterUpdated(router, trusted);
    }

    function previewSwap(
        PoolKey calldata key,
        address sender,
        SwapParams calldata params,
        bytes calldata hookData
    ) external view returns (TradePreview memory) {
        PoolId id = key.toId();
        GuardConfig memory config = _configs[id];
        return _preview(id, config, sender, params, hookData);
    }

    function quoteFee(PoolId poolId) external view returns (uint24 feePips) {
        return _feeFromRisk(_configs[poolId]);
    }

    function _beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata hookData)
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        _assertHookKey(key);

        PoolId id = key.toId();
        GuardConfig memory config = _configs[id];
        TradePreview memory preview = _preview(id, config, sender, params, hookData);

        if (preview.decision == Decision.Paused) revert GuardPaused(id);
        if (preview.decision == Decision.Blacklisted) revert TraderBlacklisted(id, preview.trader);
        if (preview.decision == Decision.AntiSnipe) {
            revert AntiSnipeActive(id, uint64(config.launchTimestamp + config.antiSnipeSeconds), config.riskScoreBps);
        }
        if (preview.decision == Decision.MaxTrade) {
            revert MaxTradeExceeded(id, preview.tradeSize, config.maxTradeSize);
        }
        if (preview.decision == Decision.Cooldown) revert CooldownActive(id, preview.trader, preview.nextAllowedAt);

        uint24 lpFeeOverride;
        if (preview.decision == Decision.Allowed) {
            lastSwapAt[id][preview.trader] = uint64(block.timestamp);
            if (key.fee.isDynamicFee()) {
                lpFeeOverride = preview.feePips | LPFeeLibrary.OVERRIDE_FEE_FLAG;
            }
            emit TradeScreened(id, preview.trader, params.amountSpecified, preview.feePips, preview.riskScoreBps);
        }

        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, lpFeeOverride);
    }

    function _preview(
        PoolId id,
        GuardConfig memory config,
        address sender,
        SwapParams calldata params,
        bytes calldata hookData
    ) internal view returns (TradePreview memory preview) {
        preview.riskScoreBps = config.riskScoreBps;

        if (!config.enabled) {
            preview.decision = Decision.Disabled;
            return preview;
        }

        preview.trader = _resolveTrader(sender, hookData);
        preview.tradeSize = _absAmount(params.amountSpecified);
        preview.whitelisted = _isWhitelisted(id, preview.trader);
        preview.blacklisted = _isBlacklisted(id, preview.trader);
        preview.feePips = _feeFromRisk(config);

        if (config.paused) {
            preview.decision = Decision.Paused;
            return preview;
        }
        if (preview.blacklisted) {
            preview.decision = Decision.Blacklisted;
            return preview;
        }
        if (preview.whitelisted) {
            preview.decision = Decision.Allowed;
            return preview;
        }
        if (_isAntiSnipeActive(config)) {
            preview.decision = Decision.AntiSnipe;
            preview.nextAllowedAt = uint64(config.launchTimestamp + config.antiSnipeSeconds);
            return preview;
        }
        if (config.maxTradeSize != 0 && preview.tradeSize > config.maxTradeSize) {
            preview.decision = Decision.MaxTrade;
            return preview;
        }

        uint64 lastSwap = lastSwapAt[id][preview.trader];
        if (config.cooldownSeconds != 0 && lastSwap != 0) {
            uint64 nextAllowedAt = lastSwap + config.cooldownSeconds;
            if (block.timestamp < nextAllowedAt) {
                preview.decision = Decision.Cooldown;
                preview.nextAllowedAt = nextAllowedAt;
                return preview;
            }
        }

        preview.decision = Decision.Allowed;
    }

    function _resolveTrader(address sender, bytes calldata hookData) internal view returns (address) {
        if (trustedRouter[sender]) {
            if (hookData.length < 32) revert InvalidHookData(sender, hookData.length);
            bytes32 traderWord;
            assembly {
                traderWord := calldataload(hookData.offset)
            }
            if (uint256(traderWord) >> 160 != 0) revert InvalidHookData(sender, hookData.length);
            address trader = address(uint160(uint256(traderWord)));
            if (trader == address(0)) revert InvalidAccount();
            return trader;
        }
        if (sender == address(0)) revert InvalidAccount();
        return sender;
    }

    function _setGlobalListStatus(address account, bool whitelisted, bool blacklisted) internal {
        if (account == address(0)) revert InvalidAccount();
        if (whitelisted && blacklisted) revert InvalidListStatus();
        globalWhitelist[account] = whitelisted;
        globalBlacklist[account] = blacklisted;
        emit GlobalListUpdated(account, whitelisted, blacklisted);
    }

    function _setPoolListStatus(PoolId id, address account, bool whitelisted, bool blacklisted) internal {
        if (account == address(0)) revert InvalidAccount();
        if (whitelisted && blacklisted) revert InvalidListStatus();
        _poolWhitelist[id][account] = whitelisted;
        _poolBlacklist[id][account] = blacklisted;
        emit PoolListUpdated(id, account, whitelisted, blacklisted);
    }

    function _isWhitelisted(PoolId id, address account) internal view returns (bool) {
        return globalWhitelist[account] || _poolWhitelist[id][account];
    }

    function _isBlacklisted(PoolId id, address account) internal view returns (bool) {
        return globalBlacklist[account] || _poolBlacklist[id][account];
    }

    function _isAntiSnipeActive(GuardConfig memory config) internal view returns (bool) {
        if (config.antiSnipeSeconds == 0) return false;
        if (config.riskScoreBps < config.antiSnipeRiskBps) return false;
        return block.timestamp < uint256(config.launchTimestamp) + config.antiSnipeSeconds;
    }

    function _feeFromRisk(GuardConfig memory config) internal pure returns (uint24 feePips) {
        if (!config.enabled) return 0;

        uint256 spread = uint256(config.maxFeePips) - config.baseFeePips;
        uint256 fee = uint256(config.baseFeePips) + (spread * config.riskScoreBps) / MAX_RISK_BPS;
        return uint24(fee);
    }

    function _assertHookKey(PoolKey calldata key) internal view {
        if (address(key.hooks) != address(this)) revert HookPoolMismatch(address(this), address(key.hooks));
    }

    function _validateConfig(GuardConfig memory config) internal pure {
        if (config.riskScoreBps > MAX_RISK_BPS) revert InvalidRiskScore(config.riskScoreBps);
        if (config.antiSnipeRiskBps > MAX_RISK_BPS) revert InvalidRiskScore(config.antiSnipeRiskBps);
        if (!config.baseFeePips.isValid() || !config.maxFeePips.isValid() || config.baseFeePips > config.maxFeePips) {
            revert InvalidFeeRange(config.baseFeePips, config.maxFeePips);
        }
        if (
            config.launchTimestamp != 0
                && uint256(config.launchTimestamp) + uint256(config.antiSnipeSeconds) > type(uint64).max
        ) {
            revert InvalidTimeWindow(config.launchTimestamp, config.antiSnipeSeconds);
        }
    }

    function _absAmount(int256 amount) internal pure returns (uint256) {
        if (amount == type(int256).min) revert AmountOverflow();
        return uint256(amount < 0 ? -amount : amount);
    }
}
