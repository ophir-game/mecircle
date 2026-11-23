// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

/// @title AttestationRegistry
/// @notice Registry of wallets whose ME ID Advanced verification has been
///         confirmed off-chain (in the ME Pass mini-program, the JSBridge
///         `getUserInfo()` call returns the logged-in user's `authStatus`,
///         e.g. ADVANCED_AUTH). A trusted attestor (the app backend / relayer
///         that performed that check) records the result here so on-chain
///         contracts — which cannot query ME ID directly — can gate on it.
/// @dev The owner manages the attestor set. The owner is also an attestor.
///      Attestation is checked at join time only: revoking a member who has
///      already joined a circle does not eject them from that circle.
contract AttestationRegistry {
    address public owner;

    mapping(address => bool) public isAttestor;
    mapping(address => bool) private _verified;
    mapping(address => uint256) public attestedAt;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event AttestorAdded(address indexed attestor);
    event AttestorRemoved(address indexed attestor);
    event Attested(address indexed account, address indexed attestor);
    event Revoked(address indexed account, address indexed attestor);

    modifier onlyOwner() {
        require(msg.sender == owner, "AR: not owner");
        _;
    }

    modifier onlyAttestor() {
        require(msg.sender == owner || isAttestor[msg.sender], "AR: not attestor");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "AR: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function addAttestor(address attestor) external onlyOwner {
        require(attestor != address(0), "AR: zero address");
        isAttestor[attestor] = true;
        emit AttestorAdded(attestor);
    }

    function removeAttestor(address attestor) external onlyOwner {
        isAttestor[attestor] = false;
        emit AttestorRemoved(attestor);
    }

    /// @notice Record that `account` passed ME ID Advanced verification.
    function attest(address account) external onlyAttestor {
        require(account != address(0), "AR: zero address");
        _verified[account] = true;
        attestedAt[account] = block.timestamp;
        emit Attested(account, msg.sender);
    }

    /// @notice Remove a previously recorded verification.
    function revoke(address account) external onlyAttestor {
        _verified[account] = false;
        attestedAt[account] = 0;
        emit Revoked(account, msg.sender);
    }

    /// @notice The gate used by SavingsCircle.join().
    function isVerified(address account) external view returns (bool) {
        return _verified[account];
    }
}
