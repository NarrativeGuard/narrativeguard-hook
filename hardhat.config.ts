import hardhatNodeTestRunnerPlugin from "@nomicfoundation/hardhat-node-test-runner";
import hardhatViemPlugin from "@nomicfoundation/hardhat-viem";
import "dotenv/config";
import { defineConfig } from "hardhat/config";

const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;

export default defineConfig({
  plugins: [hardhatViemPlugin, hardhatNodeTestRunnerPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.26",
        settings: {
          evmVersion: "cancun",
          remappings: [
            "@uniswap/v4-core/=node_modules/@uniswap/v4-periphery/lib/v4-core/",
          ],
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    xlayerMainnet: {
      type: "http",
      chainType: "generic",
      url: process.env.XLAYER_MAINNET_RPC_URL ?? "https://rpc.xlayer.tech",
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
  },
});
