// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

/// @title ReputationLedger
/// @notice Public, permanent on-chain reputation for MECircle participants.
///         Because membership is gated by ME ID (one person = one verified
///         identity), this record cannot be shed by switching wallets the
///         way an anonymous user could — it is the long-term cost of a
///         default and the long-term proof of reliability.
/// @dev Only authorized writer contracts (SavingsCircle instances created by
///      the CircleFactory) may record entries. The factory is the admin and
///      is the only account that can authorize writers.
contract ReputationLedger {
    struct Reputation {
        uint256 roundsOnTime; // rounds in which the member deposited in full
        uint256 roundsDefaulted; // rounds in which the member did not deposit
        uint256 circlesCompleted; // circles that ran to completion with this member in them
    }

    address public admin;

    mapping(address => bool) public isWriter;
    mapping(address => Reputation) private _reputations;

    event WriterSet(address indexed writer, bool authorized);
    event RoundOnTime(address indexed account);
    event RoundDefaulted(address indexed account);
    event CircleCompleted(address indexed account);

    modifier onlyAdmin() {
        require(msg.sender == admin, "RL: not admin");
        _;
    }

    modifier onlyWriter() {
        require(isWriter[msg.sender], "RL: not writer");
        _;
    }

    constructor(address _admin) {
        require(_admin != address(0), "RL: zero address");
        admin = _admin;
    }

    function setWriter(address writer, bool authorized) external onlyAdmin {
        require(writer != address(0), "RL: zero address");
        isWriter[writer] = authorized;
        emit WriterSet(writer, authorized);
    }

    function recordOnTime(address account) external onlyWriter {
        _reputations[account].roundsOnTime += 1;
        emit RoundOnTime(account);
    }

    function recordDefault(address account) external onlyWriter {
        _reputations[account].roundsDefaulted += 1;
        emit RoundDefaulted(account);
    }

    function recordCompletion(address account) external onlyWriter {
        _reputations[account].circlesCompleted += 1;
        emit CircleCompleted(account);
    }

    /// @notice Full reputation tuple for any address, readable by anyone.
    function reputationOf(address account)
        external
        view
        returns (uint256 onTime, uint256 defaulted, uint256 completed)
    {
        Reputation storage r = _reputations[account];
        return (r.roundsOnTime, r.roundsDefaulted, r.circlesCompleted);
    }

    function roundsOnTime(address account) external view returns (uint256) {
        return _reputations[account].roundsOnTime;
    }

    function roundsDefaulted(address account) external view returns (uint256) {
        return _reputations[account].roundsDefaulted;
    }

    function circlesCompleted(address account) external view returns (uint256) {
        return _reputations[account].circlesCompleted;
    }
}
