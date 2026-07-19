// ignition/modules/CertificateRegistry.js
// ----------------------------------------
// Hardhat Ignition is Hardhat's deployment system. A "module" describes
// WHAT to deploy; Ignition figures out how, sends the transaction, and
// records the result under ignition/deployments/ so it knows the contract
// address afterwards and won't deploy twice by accident.
//
// Ours is the simplest possible case: one contract, no constructor
// arguments (the constructor only does `owner = msg.sender`, and the
// sender is whoever runs the deployment — account #0 of the node).

const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("CertificateRegistryModule", (m) => {
  // "Deploy the compiled contract named CertificateRegistry."
  const registry = m.contract("CertificateRegistry");

  // Returning it makes the deployed address available to Ignition's
  // output and to any future modules that might build on this one.
  return { registry };
});
