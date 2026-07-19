// src/AdminPage.jsx
// ------------------
// The UNIVERSITY's page: issue and revoke certificates.
//
// The "admin login" here is not a username/password — it's cryptographic:
//   1. Connect MetaMask                      -> proves control of a wallet
//   2. Compare that wallet to contract.owner -> only the deployer wallet
//      sees the dashboard
//   3. And even if someone bypassed this UI, the contract's onlyOwner
//      modifier rejects their transaction on-chain. The UI check is for
//      convenience; the CONTRACT is the real security. (Good report point!)

import { useState, useEffect } from "react";
import { readContract, getSignerContract } from "./contract";

// The NTU-style honours bands offered in the issue form. Only the band
// goes on-chain — never a CGPA (deliberate data minimization).
const HONOURS_OPTIONS = [
  "First Class Honours",
  "Second Class Upper",
  "Second Class Lower",
  "Third Class",
  "Pass",
];

// Starting values for the issue form. University is prefilled since this
// deployment IS the university's registry.
const EMPTY_FORM = {
  certificateId: "",
  studentName: "",
  degree: "",
  course: "",
  department: "",
  university: "Nanyang Technological University",
  graduationDate: "",
  classOfHonours: HONOURS_OPTIONS[0],
};

function AdminPage() {
  // wallet = { address, contract } once MetaMask is connected, else null.
  const [wallet, setWallet] = useState(null);
  const [ownerAddress, setOwnerAddress] = useState(null); // from the contract
  const [form, setForm] = useState(EMPTY_FORM);
  const [revokeId, setRevokeId] = useState("");
  const [busy, setBusy] = useState(false);      // true while a tx is pending
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null); // details of the last action

  // If the user switches accounts in MetaMask, our owner check is stale —
  // reset to the "connect" state so they reconnect as the new account.
  // (useEffect with [] runs once when the page loads; the return function
  // cleans up the listener when the page unmounts.)
  useEffect(() => {
    if (!window.ethereum) return;
    const reset = () => {
      setWallet(null);
      setSuccess(null);
      setError("");
    };
    window.ethereum.on("accountsChanged", reset);
    return () => window.ethereum.removeListener("accountsChanged", reset);
  }, []);

  // Ask the contract for certCount and build the next sequential ID,
  // e.g. certCount = 2 -> "NTU-2026-00003". The ID is deliberately opaque:
  // just a counter, no student number, so the public chain never links a
  // certificate to a student's identity number.
  async function suggestNextId() {
    const count = await readContract.certCount(); // free public read
    const year = new Date().getFullYear();
    const next = String(Number(count) + 1).padStart(5, "0");
    return `NTU-${year}-${next}`;
  }

  // Step 1: connect MetaMask, learn who the contract owner is, and
  // pre-fill the suggested certificate ID.
  async function handleConnect() {
    setError("");
    try {
      const w = await getSignerContract();       // MetaMask popup happens here
      const owner = await readContract.owner();  // the university's address
      setWallet(w);
      setOwnerAddress(owner);
      setForm({ ...EMPTY_FORM, certificateId: await suggestNextId() });
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  }

  // Addresses can differ in upper/lowercase (it's a checksum thing), so
  // always compare them case-insensitively.
  const isOwner =
    wallet && ownerAddress &&
    wallet.address.toLowerCase() === ownerAddress.toLowerCase();

  // One handler for every text input in the issue form. The input's `name`
  // attribute tells us which field to update.
  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  // Turn ethers/MetaMask errors into a human sentence.
  function explainError(err) {
    if (err.code === "ACTION_REJECTED") return "You cancelled the transaction in MetaMask.";
    // err.reason carries the contract's require() message, e.g.
    // "Certificate ID already exists"
    return err.reason || err.shortMessage || err.message;
  }

  // Step 2: issue — this SIGNS and SENDS a real transaction.
  async function handleIssue(e) {
    e.preventDefault();
    setError("");
    setSuccess(null);

    // All fields are part of the hashed record, so none may be empty.
    for (const [key, value] of Object.entries(form)) {
      if (!value.trim()) {
        setError(`Please fill in: ${key}`);
        return;
      }
    }

    setBusy(true);
    try {
      // MetaMask pops up showing gas estimate; the university clicks
      // Confirm; the signed transaction goes to the node.
      const tx = await wallet.contract.issueCertificate(
        form.certificateId.trim(),
        form.studentName.trim(),
        form.degree.trim(),
        form.course.trim(),
        form.department.trim(),
        form.university.trim(),
        form.graduationDate.trim(),
        form.classOfHonours
      );

      // tx.wait() = wait until a block containing our transaction is mined.
      // The receipt is the on-chain proof: block number, tx hash, etc.
      const receipt = await tx.wait();

      setSuccess({
        action: "issued",
        id: form.certificateId.trim(),
        blockNumber: receipt.blockNumber,
        txHash: receipt.hash,
      });
      // Fresh form, with the NEXT suggested ID (certCount just went up).
      setForm({ ...EMPTY_FORM, certificateId: await suggestNextId() });
    } catch (err) {
      console.error(err);
      setError(explainError(err));
    } finally {
      setBusy(false);
    }
  }

  // Revoke — also a signed transaction, hits the contract's second
  // onlyOwner function.
  async function handleRevoke(e) {
    e.preventDefault();
    setError("");
    setSuccess(null);
    const id = revokeId.trim();
    if (!id) return;

    setBusy(true);
    try {
      const tx = await wallet.contract.revokeCertificate(id);
      const receipt = await tx.wait();
      setSuccess({
        action: "revoked",
        id,
        blockNumber: receipt.blockNumber,
        txHash: receipt.hash,
      });
      setRevokeId("");
    } catch (err) {
      console.error(err);
      setError(explainError(err));
    } finally {
      setBusy(false);
    }
  }

  // ---------------- RENDER (three states) ----------------

  // State A: not connected yet -> show the connect button.
  if (!wallet) {
    return (
      <>
        <p className="subtitle">
          University staff only — connect the university wallet to continue.
        </p>
        <button className="connect-btn" onClick={handleConnect}>
          🦊 Connect MetaMask
        </button>
        {error && <div className="card error">{error}</div>}
      </>
    );
  }

  // State B: connected, but NOT the owner -> access denied.
  if (!isOwner) {
    return (
      <>
        <div className="card notfound">
          <span className="badge badge-red">✖ Access Denied</span>
          <p>
            The connected wallet is not the university&apos;s. Only the
            contract owner can issue or revoke certificates.
          </p>
          <table>
            <tbody>
              <tr><th>Connected as</th><td className="mono">{wallet.address}</td></tr>
              <tr><th>University wallet</th><td className="mono">{ownerAddress}</td></tr>
            </tbody>
          </table>
        </div>
      </>
    );
  }

  // State C: connected AS the university -> the real dashboard.
  return (
    <>
      <p className="subtitle">
        Connected as the university:{" "}
        <span className="mono">{wallet.address}</span>
      </p>

      {/* Result / error banners */}
      {error && <div className="card error">{error}</div>}
      {success && (
        <div className="card valid">
          <span className="badge badge-green">
            ✔ Certificate {success.action}
          </span>
          <table>
            <tbody>
              <tr><th>Certificate ID</th><td>{success.id}</td></tr>
              <tr><th>Block Number</th><td>{success.blockNumber}</td></tr>
              <tr><th>Transaction</th><td className="mono">{success.txHash}</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ---- Issue form ---- */}
      <div className="card">
        <h2>Issue New Certificate</h2>
        <form className="issue-form" onSubmit={handleIssue}>
          <label>
            Certificate ID (auto-suggested — sequential, no student number)
            <input name="certificateId" value={form.certificateId} onChange={handleChange} />
          </label>
          <label>
            Student Name
            <input name="studentName" value={form.studentName} onChange={handleChange} placeholder="e.g. Jamie Esguerra" />
          </label>
          <label>
            Degree
            <input name="degree" value={form.degree} onChange={handleChange} placeholder="e.g. Bachelor of Engineering" />
          </label>
          <label>
            Course
            <input name="course" value={form.course} onChange={handleChange} placeholder="e.g. Computer Science" />
          </label>
          <label>
            Department
            <input name="department" value={form.department} onChange={handleChange} placeholder="e.g. College of Computing and Data Science" />
          </label>
          <label>
            University
            <input name="university" value={form.university} onChange={handleChange} />
          </label>
          <label>
            Graduation Date
            <input name="graduationDate" value={form.graduationDate} onChange={handleChange} placeholder="e.g. 30 June 2026" />
          </label>
          <label>
            Class of Honours
            <select name="classOfHonours" value={form.classOfHonours} onChange={handleChange}>
              {HONOURS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={busy}>
            {busy ? "Waiting for blockchain…" : "Issue Certificate"}
          </button>
        </form>
      </div>

      {/* ---- Revoke section ---- */}
      <div className="card">
        <h2>Revoke a Certificate</h2>
        <p className="hint">
          Permanent: the record stays on-chain, flagged as revoked, and
          cannot be un-revoked (re-issue under a new ID instead).
        </p>
        <form className="verify-form" onSubmit={handleRevoke}>
          <input
            value={revokeId}
            onChange={(e) => setRevokeId(e.target.value)}
            placeholder="Certificate ID to revoke"
          />
          <button type="submit" className="danger" disabled={busy}>
            {busy ? "Waiting…" : "Revoke"}
          </button>
        </form>
      </div>
    </>
  );
}

export default AdminPage;
