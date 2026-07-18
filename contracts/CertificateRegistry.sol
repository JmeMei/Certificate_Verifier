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
    }

    // The core database: Certificate ID (e.g. "NTU-2026-00123") -> record.
    // `private` = other smart contracts can't read it directly; the outside
    // world uses verifyCertificate() below instead.
    mapping(string => Certificate) private certificates;

    // The university's wallet address. `public` auto-creates a free getter,
    // so the frontend can ask "who is the owner?" — that is how your admin
    // page will decide whether to show the issuing dashboard.
    address public owner;

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

        // Save the record. block.timestamp = the time the miner/validator
        // stamped on this block (in seconds since 1 Jan 1970).
        certificates[certificateId] = Certificate({
            studentName: studentName,
            degree: degree,
            course: course,
            department: department,
            university: university,
            graduationDate: graduationDate,
            classOfHonours: classOfHonours,
            certHash: certHash,
            issuedAt: block.timestamp,
            exists: true
        });

        // Write the log entry the frontend will use (block number lives in
        // the receipt of this transaction).
        emit CertificateIssued(certificateId, certHash, block.timestamp);
    }

    /**
     * Verify a certificate by its ID. This is the public function behind
     * your verification page.
     *
     * `view` = reads data but never changes it, so calling it is FREE
     * (no gas, no wallet needed, no transaction — just a query to a node).
     *
     * Returns:
     *   isValid — true only if this ID was genuinely issued
     *   cert    — the full record (all-empty struct if isValid is false)
     */
    function verifyCertificate(string calldata certificateId)
        external
        view
        returns (bool isValid, Certificate memory cert)
    {
        cert = certificates[certificateId];
        isValid = cert.exists;
    }
}
