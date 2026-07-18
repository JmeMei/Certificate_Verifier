require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      // viaIR + optimizer: needed because issueCertificate takes 8 string
      // parameters, which exceeds the EVM's 16-slot stack limit under the
      // default compiler pipeline ("stack too deep" error).
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
};
