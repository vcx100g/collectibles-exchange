import { defineConfig, configVariable } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    // In-process simulated chain used by `hardhat test`.
    hardhat: {
      type: "edr-simulated",
      chainType: "l1",
    },
    // The standalone dev chain started by `hardhat node` (default chainId 31337).
    // MetaMask connects to http://localhost:8545 ; in-container scripts use this.
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
    },
    // Public testnet — used later in Layer 2 (not needed for the local demo).
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
  },
});
