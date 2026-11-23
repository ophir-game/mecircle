// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {AttestationRegistry} from "./AttestationRegistry.sol";
import {ReputationLedger} from "./ReputationLedger.sol";

/// @dev Minimal ERC20 surface used when a circle runs on a token instead of
///      the native coin. Transfers are executed through low-level calls so
///      non-standard tokens (no return value) do not break the flow.
interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title SavingsCircle
/// @notice One rotating savings circle (ROSCA / arisan). Members gated by
///         ME ID attestation each deposit a fixed amount per round; the
///         whole pot of each round is paid to one member, rotating in join
///         order, until every member has received the pot exactly once.
///
/// Rules (deliberately simple, see README.md):
///  - Joining is free and only possible while the circle is Forming. The
///    circle activates automatically when it reaches maxMembers; round 1
///    starts at that moment.
///  - Each round, every member must deposit exactly `contributionAmount`
///    once. A round can be closed by anyone via advanceRound() once either
///    everyone has deposited or the round deadline has passed.
///  - Members who did not deposit in a closed round are recorded as
///    defaulted for that round in the ReputationLedger. They are NOT
///    ejected: they keep their seat and their payout turn.
///  - The pot paid out is the amount actually collected that round
///    (contributionAmount x deposits made), not a promised fixed amount.
///    A recipient receives their pot even if they defaulted in their own
///    payout round (standard ROSCA practice); the default is still on
///    their permanent reputation record.
///  - Because the pot equals what was collected, the contract balance
///    returns to zero at the end of every round by construction: no funds
///    can be left locked when the circle completes.
///  - If a payout transfer itself fails (e.g. a recipient contract that
///    rejects native coin), the amount is credited to
///    `pendingWithdrawals` instead of reverting, so one bad recipient can
///    never brick the circle; the recipient pulls it later via withdraw().
///  - There is no admin and no way for anyone — including the factory or
///    the creator — to withdraw members' funds.
contract SavingsCircle {
    enum Phase {
        Forming,
        Active,
        Completed
    }

    // --- immutable configuration -------------------------------------------
    address public immutable factory;
    AttestationRegistry public immutable registry;
    ReputationLedger public immutable ledger;
    address public immutable creator;
    /// @notice ERC20 token used for deposits/payouts; address(0) = native coin.
    address public immutable token;
    uint256 public immutable contributionAmount;
    uint256 public immutable maxMembers;
    /// @notice Length of one round in seconds.
    uint256 public immutable roundDuration;

    // --- state ---------------------------------------------------------------
    Phase public phase;
    address[] public members;
    mapping(address => uint256) private _memberIndexPlusOne; // 0 = not a member
    uint256 public currentRound; // 1-based while Active; 0 while Forming
    uint256 public roundDeadline; // timestamp by which the current round should close
    uint256 public depositsThisRound;
    uint256 public collectedThisRound;
    mapping(uint256 => mapping(address => bool)) public hasDeposited;
    /// @notice Payouts that could not be pushed and are waiting to be pulled.
    mapping(address => uint256) public pendingWithdrawals;

    uint256 private _reentrancyStatus; // 1 = idle, 2 = entered

    // --- events ----------------------------------------------------------------
    event MemberJoined(address indexed member, uint256 memberCount);
    event MemberLeft(address indexed member, uint256 memberCount);
    event CircleActivated(uint256 firstRoundDeadline);
    event DepositMade(address indexed member, uint256 indexed round, uint256 amount);
    event RoundAdvanced(
        uint256 indexed round, address indexed recipient, uint256 pot, uint256 defaultsThisRound
    );
    event PotPaid(address indexed recipient, uint256 indexed round, uint256 amount);
    event PayoutDeferred(address indexed recipient, uint256 indexed round, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event CircleCompleted(uint256 totalRounds);

    modifier nonReentrant() {
        require(_reentrancyStatus != 2, "SC: reentrant call");
        _reentrancyStatus = 2;
        _;
        _reentrancyStatus = 1;
    }

    constructor(
        address _registry,
        address _ledger,
        address _creator,
        address _token,
        uint256 _contributionAmount,
        uint256 _maxMembers,
        uint256 _roundDuration
    ) {
        factory = msg.sender;
        registry = AttestationRegistry(_registry);
        ledger = ReputationLedger(_ledger);
        creator = _creator;
        token = _token;
        contributionAmount = _contributionAmount;
        maxMembers = _maxMembers;
        roundDuration = _roundDuration;
        phase = Phase.Forming;
        _reentrancyStatus = 1;
    }

    // --- membership ----------------------------------------------------------

    /// @notice Join the circle. Requires ME ID attestation; one seat per address.
    function join() external {
        require(phase == Phase.Forming, "SC: not forming");
        require(registry.isVerified(msg.sender), "SC: ME ID not verified");
        require(_memberIndexPlusOne[msg.sender] == 0, "SC: already a member");
        require(members.length < maxMembers, "SC: circle full");

        members.push(msg.sender);
        _memberIndexPlusOne[msg.sender] = members.length; // index + 1
        emit MemberJoined(msg.sender, members.length);

        if (members.length == maxMembers) {
            phase = Phase.Active;
            currentRound = 1;
            roundDeadline = block.timestamp + roundDuration;
            emit CircleActivated(roundDeadline);
        }
    }

    /// @notice Leave while the circle is still forming. No funds are held
    ///         before activation, so leaving is always lossless.
    function leave() external {
        require(phase == Phase.Forming, "SC: already active");
        uint256 idxPlusOne = _memberIndexPlusOne[msg.sender];
        require(idxPlusOne != 0, "SC: not a member");

        uint256 idx = idxPlusOne - 1;
        uint256 lastIdx = members.length - 1;
        if (idx != lastIdx) {
            address last = members[lastIdx];
            members[idx] = last;
            _memberIndexPlusOne[last] = idx + 1;
        }
        members.pop();
        delete _memberIndexPlusOne[msg.sender];
        emit MemberLeft(msg.sender, members.length);
    }

    // --- rounds ----------------------------------------------------------------

    /// @notice Deposit this round's contribution (exactly contributionAmount).
    function deposit() external payable nonReentrant {
        require(phase == Phase.Active, "SC: not active");
        require(_memberIndexPlusOne[msg.sender] != 0, "SC: not a member");
        require(!hasDeposited[currentRound][msg.sender], "SC: already deposited");

        if (token == address(0)) {
            require(msg.value == contributionAmount, "SC: wrong amount");
        } else {
            require(msg.value == 0, "SC: token circle takes no native coin");
            uint256 before = IERC20Minimal(token).balanceOf(address(this));
            _safeTransferFrom(token, msg.sender, address(this), contributionAmount);
            uint256 received = IERC20Minimal(token).balanceOf(address(this)) - before;
            require(received == contributionAmount, "SC: fee-on-transfer not supported");
        }

        hasDeposited[currentRound][msg.sender] = true;
        depositsThisRound += 1;
        collectedThisRound += contributionAmount;
        emit DepositMade(msg.sender, currentRound, contributionAmount);
    }

    /// @notice Close the current round and pay its pot to this round's
    ///         recipient (join order). Permissionless: anyone may call once
    ///         all members deposited or the round deadline has passed.
    function advanceRound() external nonReentrant {
        require(phase == Phase.Active, "SC: not active");
        uint256 count = members.length;
        require(
            depositsThisRound == count || block.timestamp >= roundDeadline,
            "SC: round still open"
        );

        uint256 round = currentRound;
        bool isFinalRound = round == count;
        address recipient = members[round - 1];
        uint256 pot = collectedThisRound;
        uint256 defaultsThisRound = count - depositsThisRound;

        // --- effects: reputation for the round being closed -------------------
        for (uint256 i = 0; i < count; i++) {
            address member = members[i];
            if (hasDeposited[round][member]) {
                ledger.recordOnTime(member);
            } else {
                ledger.recordDefault(member);
            }
            if (isFinalRound) {
                ledger.recordCompletion(member);
            }
        }

        // --- effects: round bookkeeping ---------------------------------------
        depositsThisRound = 0;
        collectedThisRound = 0;
        if (isFinalRound) {
            phase = Phase.Completed;
        } else {
            currentRound = round + 1;
            roundDeadline = block.timestamp + roundDuration;
        }

        emit RoundAdvanced(round, recipient, pot, defaultsThisRound);
        if (isFinalRound) {
            emit CircleCompleted(round);
        }

        // --- interaction: pay the pot (push, with pull fallback) --------------
        if (pot > 0) {
            if (_tryPay(recipient, pot)) {
                emit PotPaid(recipient, round, pot);
            } else {
                pendingWithdrawals[recipient] += pot;
                emit PayoutDeferred(recipient, round, pot);
            }
        }
    }

    /// @notice Pull a payout that could not be pushed earlier.
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "SC: nothing to withdraw");
        pendingWithdrawals[msg.sender] = 0;
        require(_tryPay(msg.sender, amount), "SC: transfer failed");
        emit Withdrawn(msg.sender, amount);
    }

    // --- views -------------------------------------------------------------------

    function isMember(address account) external view returns (bool) {
        return _memberIndexPlusOne[account] != 0;
    }

    function memberCount() external view returns (uint256) {
        return members.length;
    }

    function getMembers() external view returns (address[] memory) {
        return members;
    }

    // --- internal ------------------------------------------------------------------

    /// @dev Attempts to send `amount` of the circle's asset to `to`.
    ///      Returns false instead of reverting so the caller can fall back
    ///      to a pull credit.
    function _tryPay(address to, uint256 amount) internal returns (bool) {
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            return ok;
        }
        return _safeTransfer(token, to, amount);
    }

    function _safeTransfer(address _token, address to, uint256 amount) internal returns (bool) {
        (bool ok, bytes memory data) =
            _token.call(abi.encodeWithSelector(IERC20Minimal.transfer.selector, to, amount));
        return ok && (data.length == 0 || abi.decode(data, (bool)));
    }

    function _safeTransferFrom(address _token, address from, address to, uint256 amount)
        internal
        returns (bool)
    {
        (bool ok, bytes memory data) = _token.call(
            abi.encodeWithSelector(IERC20Minimal.transferFrom.selector, from, to, amount)
        );
        return ok && (data.length == 0 || abi.decode(data, (bool)));
    }
}
