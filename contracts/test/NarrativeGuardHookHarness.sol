// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {IPoolManager} from "@uniswap/v4-periphery/lib/v4-core/src/interfaces/IPoolManager.sol";
import {NarrativeGuardHook} from "../NarrativeGuardHook.sol";

/// @notice Test-only hook that skips v4 address-bit validation.
contract NarrativeGuardHookHarness is NarrativeGuardHook {
    constructor(IPoolManager manager, address initialRiskOracle, address initialOwner)
        NarrativeGuardHook(manager, initialRiskOracle, initialOwner)
    {}

    function validateHookAddress(BaseHook) internal pure override {}
}
