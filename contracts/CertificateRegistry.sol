// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * CertificateRegistry
 * -------------------
 * The university (contract owner) issues certificates on-chain.
 * Anyone can verify a certificate by its ID — no login needed.
 *
 * Think of this contract as a public, tamper-proof database:
 * - The code below is frozen once deployed (nobody can change the rules).
 * - The stored data can only change in ways these functions allow.
 */
contract CertificateRegistry {
    // ---------------------------------------------------------------
    // DATA
    // ---------------------------------------------------------------

    // One record per certificate — these are exactly the fields the
    // verification UI will display.
    struct Certificate {
        string studentName;     // e.g. "Jamie Esguerra"
        string degree;          // e.g. "Bachelor of Engineering"
        string course;          // e.g. "Computer Science"
        string department;      // e.g. "College of Computing and Data Science"
        string university;      // e.g. "Nanyang Technological University"
        string graduationDate;  // e.g. "30 June 2026"
        string classOfHonours;  // honours band only, never the CGPA —
                                // e.g. "First Class Honours", "Second Class Upper"
        bytes32 certHash;       // keccak256 fingerprint of all fields above
        uint256 issuedAt;       // when it was issued (Unix timestamp, in seconds)
        bool exists;            // true = this ID was really issued.
                                // Needed because looking up an unknown ID in a
                                // mapping returns an all-empty struct, not an error.
        bool revoked;           // true = the university withdrew this certificate
                                // after issuing it. The record is NEVER deleted —
                                // keeping it (flagged) preserves the audit trail
                                // and lets verifiers distinguish "Revoked" from
                                // "never existed".
        uint256 revokedAt;      // when it was revoked (0 = never revoked)
    }

    // The core database: Certificate ID (e.g. "NTU-2026-00123") -> record.
    // `private` = other smart contracts can't read it directly; the outside
    // world uses verifyCertificate() below instead.
    mapping(string => Certificate) private certificates;

    // The university's wallet address. `public` auto-creates a free getter,
    // so the frontend can ask "who is the owner?" — that is how your admin
    // page will decide whether to show the issuing dashboard.
    address public owner;

    // Running total of certificates ever issued. The admin frontend reads
    // this (free, it's public) to suggest the next sequential ID, e.g.
    // "NTU-2026-<certCount + 1>". Sequential IDs are deliberately opaque:
    // they encode nothing about the student (no matric number), so the
    // public chain never links a certificate to a student identity number.
    // Uniqueness is still enforced by the require() in issueCertificate —
    // this counter only exists to SUGGEST the next ID.
    uint256 public certCount;

    // ---------------------------------------------------------------
    // EVENTS
    // ---------------------------------------------------------------

    // Events are log entries written into the block when something happens.
    // They cost little, contracts can't read them back, but frontends can —
    // this is how your UI will find the BLOCK NUMBER of an issuance:
    // web3.js reads this event from the transaction receipt.
    // `indexed` makes a field searchable (e.g. "give me all events for this ID").
    event CertificateIssued(
        string indexed certificateId,
        bytes32 certHash,
        uint256 issuedAt
    );

    // Emitted when the university withdraws a certificate. Gives the public
    // a permanent, timestamped log of every revocation.
    event CertificateRevoked(
        string indexed certificateId,
        uint256 revokedAt
    );

    // ---------------------------------------------------------------
    // SETUP & ACCESS CONTROL
    // ---------------------------------------------------------------

    // Runs exactly once, at deployment. msg.sender = the address that sent
    // this transaction — i.e. whoever deploys the contract becomes the owner.
    constructor() {
        owner = msg.sender;
    }

    // A reusable guard. Any function marked `onlyOwner` first checks that the
    // caller is the university; if not, `require` cancels the whole
    // transaction and nothing is saved. The `_;` means "now run the function".
    modifier onlyOwner() {
        require(msg.sender == owner, "Only the university can perform this action");
        _;
    }

    // ---------------------------------------------------------------
    // FUNCTIONS
    // ---------------------------------------------------------------

    /**
     * Issue a new certificate. Only the university's address may call this.
     *
     * 3 different data locations: 
     * storage - when you want to modfy the data
     * memory - when you just want to read the data
     * calldata - 
     * 
     * `calldata` = the string lives in the incoming transaction data
     * (read-only, cheapest option) instead of being copied into memory.
     *
     * This function WRITES to the blockchain, so calling it costs gas and
     * needs a signed transaction from the owner's wallet.
     */
    function issueCertificate(
        string calldata certificateId,
        string calldata studentName,
        string calldata degree,
        string calldata course,
        string calldata department,
        string calldata university,
        string calldata graduationDate,
        string calldata classOfHonours
    ) external onlyOwner {
        // Each ID can only ever be issued once. Without this check the
        // university could silently overwrite a certificate — the whole
        // point of the project is that issued records are immutable.
        require(!certificates[certificateId].exists, "Certificate ID already exists");

        // Fingerprint the certificate: pack every field into one byte string
        // and hash it. Change one letter anywhere -> completely different hash.
        // keccak256 is Ethereum's built-in hash function (same family as SHA-3).
        bytes32 certHash = keccak256(
            abi.encodePacked(
                certificateId,
                studentName,
                degree,
                course,
                department,
                university,
                graduationDate,
                classOfHonours
            )
        );

        // Save the record, field by field, through a `storage` pointer.
        // (Building the whole 12-field struct in one expression overflows the
        // EVM's 16-slot stack; one-at-a-time assignments stay well under it.)
        // `cert` is NOT a copy — it points directly at the blockchain slot
        // for this ID, so each assignment writes straight to storage.
        Certificate storage cert = certificates[certificateId];
        cert.studentName = studentName;
        cert.degree = degree;
        cert.course = course;
        cert.department = department;
        cert.university = university;
        cert.graduationDate = graduationDate;
        cert.classOfHonours = classOfHonours;
        cert.certHash = certHash;
        // block.timestamp = the time the validator stamped on this block
        // (in seconds since 1 Jan 1970).
        cert.issuedAt = block.timestamp;
        cert.exists = true;
        // revoked and revokedAt keep their defaults (false / 0):
        // every certificate starts life valid.

        // Count this successful issuance. If any require() above had failed,
        // the whole transaction would revert and this line would never run —
        // so certCount only ever counts real, stored certificates.
        certCount += 1;

        // Write the log entry the frontend will use (block number lives in
        // the receipt of this transaction).
        emit CertificateIssued(certificateId, certHash, block.timestamp);
    }

    /**
     * Revoke a previously issued certificate. Only the university may do this.
     *
     * The record is NOT deleted — it is flagged. A verifier can then see
     * "issued on X, revoked on Y" (status: Revoked) instead of the record
     * silently disappearing, which would be indistinguishable from a
     * certificate that never existed. Revocation is permanent: there is
     * deliberately no "un-revoke" function (re-issue under a new ID instead).
     */
    function revokeCertificate(string calldata certificateId) external onlyOwner {
        // Can only revoke something that was actually issued.
        require(certificates[certificateId].exists, "Certificate does not exist");
        // Revoking twice would overwrite the original revocation timestamp.
        require(!certificates[certificateId].revoked, "Certificate already revoked");

        certificates[certificateId].revoked = true;
        certificates[certificateId].revokedAt = block.timestamp;

        emit CertificateRevoked(certificateId, block.timestamp);
    }

    /**
     * Verify a certificate by its ID. This is the public function behind
     * your verification page.
     *
     * `view` = reads data but never changes it, so calling it is FREE
     * (no gas, no wallet needed, no transaction — just a query to a node).
     *
     * Returns:
     *   isValid — true only if this ID was issued AND not revoked
     *   cert    — the full record (all-empty struct if the ID is unknown)
     *
     * The three UI states come from combining the two return values:
     *   isValid == true                      -> "Valid"
     *   isValid == false, cert.exists true   -> "Revoked" (see cert.revokedAt)
     *   isValid == false, cert.exists false  -> "Not found / Invalid"
     */
    function verifyCertificate(string calldata certificateId)
        external
        view
        returns (bool isValid, Certificate memory cert)
    {
        cert = certificates[certificateId];
        isValid = cert.exists && !cert.revoked;
    }
}
