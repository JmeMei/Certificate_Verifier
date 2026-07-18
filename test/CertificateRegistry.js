// test/CertificateRegistry.js
// ---------------------------
// Every `npx hardhat test` run spins up a FRESH in-memory blockchain,
// deploys the contract to it, runs these checks, then throws it all away.
// Nothing here touches MetaMask, Sepolia, or the internet.
//
// Libraries involved (all bundled with hardhat-toolbox):
//   - mocha : the test runner — gives us describe() (a group) and it() (one test)
//   - chai  : the assertion library — gives us expect(x).to.equal(y) etc.
//   - ethers: talks to the blockchain from JavaScript (tests only —
//             your frontend will use web3.js; same contract, different library)

const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CertificateRegistry", function () {
  // One sample certificate reused by every test below.
  const sample = {
    id: "NTU-2026-00123",
    studentName: "Jamie Esguerra",
    degree: "Bachelor of Engineering",
    course: "Computer Science",
    department: "College of Computing and Data Science",
    university: "Nanyang Technological University",
    graduationDate: "30 June 2026",
    classOfHonours: "First Class Honours",
  };

  // The contract's issueCertificate() takes 8 separate arguments in a fixed
  // order — this helper turns the object above into that ordered list, so we
  // never mistype the order in individual tests.
  function issueArgs(c) {
    return [
      c.id,
      c.studentName,
      c.degree,
      c.course,
      c.department,
      c.university,
      c.graduationDate,
      c.classOfHonours,
    ];
  }

  // Recompute the certificate hash in JavaScript, the same way the contract
  // does in Solidity: keccak256(abi.encodePacked(...all 8 strings)).
  // ethers.solidityPackedKeccak256 is the JS twin of that exact operation.
  // If contract and JS agree on the hash, we know the on-chain fingerprint
  // is reproducible off-chain — that's the tamper-evidence story.
  function expectedHash(c) {
    return ethers.solidityPackedKeccak256(
      ["string", "string", "string", "string", "string", "string", "string", "string"],
      issueArgs(c)
    );
  }

  // A "fixture" deploys the contract once, and loadFixture() snapshots the
  // blockchain state — each test then starts from that clean snapshot
  // instead of re-deploying (faster, and no test can pollute another).
  async function deployFixture() {
    // Hardhat's test blockchain comes with 20 pre-funded fake accounts.
    // The FIRST one deploys the contract, so it becomes `owner` (the
    // university). We grab a second one to play "random stranger".
    const [university, stranger] = await ethers.getSigners();

    const registry = await ethers.deployContract("CertificateRegistry");
    return { registry, university, stranger };
  }

  // ----------------------------------------------------------------
  describe("Deployment", function () {
    it("sets the deployer as the owner (the university)", async function () {
      const { registry, university } = await loadFixture(deployFixture);

      // registry.owner() is the free getter Solidity generated because we
      // declared `address public owner`.
      expect(await registry.owner()).to.equal(university.address);
    });
  });

  // ----------------------------------------------------------------
  describe("Issuing certificates", function () {
    it("issues a certificate and emits a CertificateIssued event", async function () {
      const { registry } = await loadFixture(deployFixture);

      // We assert on the EVENT because that's the on-chain receipt of the
      // action — the same log your frontend will read to show block number.
      // anyValue = "don't care" for the timestamp (we can't predict the
      // exact second the test block gets mined).
      await expect(registry.issueCertificate(...issueArgs(sample)))
        .to.emit(registry, "CertificateIssued")
        .withArgs(sample.id, expectedHash(sample), anyValue);
    });

    it("refuses to issue the same certificate ID twice", async function () {
      const { registry } = await loadFixture(deployFixture);

      await registry.issueCertificate(...issueArgs(sample));

      // Second attempt with the same ID must hit our require() and revert.
      // "revert" = the transaction is cancelled and no state is changed —
      // this is what makes issued certificates impossible to overwrite.
      await expect(
        registry.issueCertificate(...issueArgs(sample))
      ).to.be.revertedWith("Certificate ID already exists");
    });

    it("refuses issuing from any wallet that is not the university", async function () {
      const { registry, stranger } = await loadFixture(deployFixture);

      // .connect(stranger) = "send the next transaction from this other
      // wallet". The onlyOwner modifier must reject it. This test IS your
      // security claim: forgers cannot mint certificates.
      await expect(
        registry.connect(stranger).issueCertificate(...issueArgs(sample))
      ).to.be.revertedWith("Only the university can perform this action");
    });
  });

  // ----------------------------------------------------------------
  describe("Verifying certificates", function () {
    it("returns isValid = true and the full details for a real certificate", async function () {
      const { registry } = await loadFixture(deployFixture);
      await registry.issueCertificate(...issueArgs(sample));

      // verifyCertificate is a `view` function, so calling it is a free
      // read — no transaction, exactly how the public verification page
      // will call it. It returns two things: [isValid, certStruct].
      const [isValid, cert] = await registry.verifyCertificate(sample.id);

      expect(isValid).to.be.true;

      // Every field the UI will display must come back exactly as issued.
      expect(cert.studentName).to.equal(sample.studentName);
      expect(cert.degree).to.equal(sample.degree);
      expect(cert.course).to.equal(sample.course);
      expect(cert.department).to.equal(sample.department);
      expect(cert.university).to.equal(sample.university);
      expect(cert.graduationDate).to.equal(sample.graduationDate);
      expect(cert.classOfHonours).to.equal(sample.classOfHonours);

      // The stored fingerprint must match the hash we recomputed in JS.
      expect(cert.certHash).to.equal(expectedHash(sample));

      // issuedAt was stamped with block.timestamp, so it must be non-zero.
      expect(cert.issuedAt).to.be.greaterThan(0);
    });

    it("returns isValid = false for a certificate ID that was never issued", async function () {
      const { registry } = await loadFixture(deployFixture);

      const [isValid, cert] = await registry.verifyCertificate("FAKE-9999");

      // The mapping returns an all-empty struct for unknown IDs — our
      // `exists` flag is what turns that into a clean false.
      expect(isValid).to.be.false;
      expect(cert.studentName).to.equal("");
    });
  });
});
