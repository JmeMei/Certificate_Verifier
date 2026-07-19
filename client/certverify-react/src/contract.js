// src/contract.js
// ---------------
// The ONE place the frontend knows about the blockchain. Every page imports
// its contract object from here — so when you redeploy, this is the only
// file to update.
//
// Two ingredients are needed to talk to a deployed contract:
//   1. WHERE it is  -> the contract address (printed by `ignition deploy`)
//   2. WHAT it is   -> the ABI, the JSON "menu" of its functions that the
//                      Solidity compiler generated. We copied the artifact
//                      from artifacts/contracts/.../CertificateRegistry.json.
//                      (Re-copy it if you ever change the contract!)

import { ethers } from "ethers";
import artifact from "./CertificateRegistry.json";

// Deployed address on the LOCAL Hardhat chain. Fun fact: this exact address
// is deterministic — it's computed from (deployer address, transaction
// count), so the first contract Account #0 deploys on a fresh local chain
// ALWAYS lands here. Restarting the node and redeploying keeps it valid.
// When you deploy to Sepolia later, you'll swap in that address instead.
export const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

// A "provider" is a READ-ONLY connection to a blockchain node.
// We point it straight at your local Hardhat node — the same URL you gave
// MetaMask. Reading needs no wallet, no signatures, no gas: that's why the
// public verification page works for anyone, with nothing installed.
export const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

// The contract object: address + ABI + connection. After this line,
// JavaScript can call the Solidity functions by name, exactly like in
// our Hardhat tests: readContract.verifyCertificate("NTU-2026-00001")
export const readContract = new ethers.Contract(
  CONTRACT_ADDRESS,
  artifact.abi,
  provider
);

// Later, the ADMIN page will need to WRITE (issue/revoke), which requires
// a signature from the university's wallet. That version of the contract
// object gets built from MetaMask instead of the read-only provider —
// we'll add a getSignerContract() helper here when we build that page.
