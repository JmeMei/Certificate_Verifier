// src/App.jsx
// -----------
// The PUBLIC verification page. Anyone — an employer, another university —
// types a Certificate ID and gets one of three answers, straight from the
// blockchain:
//
//   VALID     -> full certificate details + blockchain proof
//   REVOKED   -> the certificate existed but was withdrawn (with date)
//   NOT FOUND -> no such certificate was ever issued
//
// Note there is NO login and NO MetaMask needed here: verifying only READS
// the chain (a free `view` call), exactly like in our Hardhat tests.

import { useState } from "react";
import { readContract } from "./contract";
import "./App.css";

function App() {
  // React "state": values that, when changed, make the page re-render.
  const [certId, setCertId] = useState("");        // what's typed in the box
  const [checking, setChecking] = useState(false); // true while we query
  const [result, setResult] = useState(null);      // outcome of the last check
  const [error, setError] = useState("");          // connection problems etc.

  // Runs when the user clicks "Verify" (or presses Enter).
  async function handleVerify(e) {
    e.preventDefault(); // stop the browser reloading the page on form submit
    const id = certId.trim();
    if (!id) return;

    setChecking(true);
    setResult(null);
    setError("");

    try {
      // THE core call: same function our tests call. ethers sends it to the
      // local node as a free read — no transaction, no gas, no wallet.
      // Solidity returned (bool isValid, Certificate cert); ethers gives us
      // that as an array we unpack into two variables.
      const [isValid, cert] = await readContract.verifyCertificate(id);

      // Work out which of the three states we're in (mirrors the comment
      // in verifyCertificate in the Solidity code).
      let state;
      if (isValid) state = "valid";
      else if (cert.exists) state = "revoked";
      else state = "notfound";

      // For real certificates, also fetch the issuance EVENT to get the
      // blockchain proof info (block number + transaction hash). Events
      // are permanent logs; we ask the node: "find CertificateIssued
      // events for this ID, from block 0 until now".
      let blockNumber = null;
      let txHash = null;
      if (cert.exists) {
        const filter = readContract.filters.CertificateIssued(id);
        const events = await readContract.queryFilter(filter, 0, "latest");
        if (events.length > 0) {
          blockNumber = events[0].blockNumber;
          txHash = events[0].transactionHash;
        }
      }

      setResult({ state, id, cert, blockNumber, txHash });
    } catch (err) {
      // Most common cause during development: the Hardhat node (Terminal 1)
      // isn't running, so there's no blockchain to ask.
      console.error(err);
      setError(
        "Could not reach the blockchain. Is the local Hardhat node running? " +
          "(npx hardhat node in Terminal 1)"
      );
    } finally {
      setChecking(false); // runs whether the call succeeded or failed
    }
  }

  // Solidity gives timestamps as SECONDS (bigint); JavaScript dates want
  // MILLISECONDS (number). Convert, then format for humans.
  function formatTimestamp(ts) {
    return new Date(Number(ts) * 1000).toLocaleString();
  }

  return (
    <div className="page">
      <header>
        <h1>🎓 Certificate Verifier</h1>
        <p className="subtitle">
          Verify the authenticity of a university certificate on the
          blockchain — instantly, no account needed.
        </p>
      </header>

      {/* The search form */}
      <form className="verify-form" onSubmit={handleVerify}>
        <input
          type="text"
          value={certId}
          onChange={(e) => setCertId(e.target.value)}
          placeholder="Enter Certificate ID, e.g. NTU-2026-00001"
        />
        <button type="submit" disabled={checking}>
          {checking ? "Checking…" : "Verify"}
        </button>
      </form>

      {/* Connection problems */}
      {error && <div className="card error">{error}</div>}

      {/* NOT FOUND */}
      {result?.state === "notfound" && (
        <div className="card notfound">
          <span className="badge badge-red">✖ Not Found</span>
          <p>
            No certificate with ID <strong>{result.id}</strong> has ever been
            issued. This certificate is <strong>not authentic</strong>.
          </p>
        </div>
      )}

      {/* VALID or REVOKED — both show the full record */}
      {(result?.state === "valid" || result?.state === "revoked") && (
        <div className={`card ${result.state}`}>
          {result.state === "valid" ? (
            <span className="badge badge-green">✔ Valid Certificate</span>
          ) : (
            <span className="badge badge-orange">
              ⚠ Revoked on {formatTimestamp(result.cert.revokedAt)}
            </span>
          )}

          <h2>Certificate Details</h2>
          <table>
            <tbody>
              <tr><th>Certificate ID</th><td>{result.id}</td></tr>
              <tr><th>Student Name</th><td>{result.cert.studentName}</td></tr>
              <tr><th>Degree</th><td>{result.cert.degree}</td></tr>
              <tr><th>Course</th><td>{result.cert.course}</td></tr>
              <tr><th>Department</th><td>{result.cert.department}</td></tr>
              <tr><th>University</th><td>{result.cert.university}</td></tr>
              <tr><th>Graduation Date</th><td>{result.cert.graduationDate}</td></tr>
              <tr><th>Class of Honours</th><td>{result.cert.classOfHonours}</td></tr>
            </tbody>
          </table>

          <h2>Blockchain Proof</h2>
          <table>
            <tbody>
              <tr>
                <th>Certificate Hash</th>
                <td className="mono">{result.cert.certHash}</td>
              </tr>
              <tr>
                <th>Issued At</th>
                <td>{formatTimestamp(result.cert.issuedAt)}</td>
              </tr>
              {result.blockNumber !== null && (
                <tr><th>Block Number</th><td>{result.blockNumber}</td></tr>
              )}
              {result.txHash && (
                <tr>
                  <th>Transaction</th>
                  <td className="mono">{result.txHash}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;
