// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {AttestationRegistry} from "./AttestationRegistry.sol";
import {ReputationLedger} from "./ReputationLedger.sol";
import {SavingsCircle} from "./SavingsCircle.sol";

/// @title CircleFactory
/// @notice Creates SavingsCircle instances wired to the shared
///         AttestationRegistry (ME ID gate) and ReputationLedger.
///         The factory deploys the ReputationLedger itself and authorizes
///         every circle it creates as a reputation writer. The factory
///         holds no funds and has no power over circles after creation.
contract CircleFactory {
    /// @notice Bounds keep the per-round reputation loop in advanceRound()
    ///         cheap and bounded.
    uint256 public constant MIN_MEMBERS = 2;
    uint256 public constant MAX_MEMBERS = 50;

    AttestationRegistry public immutable registry;
    ReputationLedger public immutable ledger;

    address[] public circles;

    event CircleCreated(
        address indexed circle,
        address indexed creator,
        address token,
        uint256 contributionAmount,
        uint256 maxMembers,
        uint256 roundDuration
    );

    constructor(address _registry) {
        require(_registry != address(0), "CF: zero address");
        registry = AttestationRegistry(_registry);
        ledger = new ReputationLedger(address(this));
    }

    /// @notice Create a new savings circle.
    /// @param contributionAmount Exact deposit per member per round.
    /// @param maxMembers Seats in the circle (2..50). The circle activates
    ///        and round 1 starts when the last seat is taken. The number of
    ///        rounds equals the number of members.
    /// @param roundDuration Length of one round in seconds (> 0).
    /// @param token ERC20 token for deposits/payouts, or address(0) for the
    ///        native coin (MEC on ME Network).
    /// @return circle The address of the new SavingsCircle.
    function createCircle(
        uint256 contributionAmount,
        uint256 maxMembers,
        uint256 roundDuration,
        address token
    ) external returns (address circle) {
        require(contributionAmount > 0, "CF: contribution must be > 0");
        require(
            maxMembers >= MIN_MEMBERS && maxMembers <= MAX_MEMBERS, "CF: member count out of range"
        );
        require(roundDuration > 0, "CF: round duration must be > 0");

        SavingsCircle newCircle = new SavingsCircle(
            address(registry),
            address(ledger),
            msg.sender,
            token,
            contributionAmount,
            maxMembers,
            roundDuration
        );
        circle = address(newCircle);
        ledger.setWriter(circle, true);
        circles.push(circle);
        emit CircleCreated(circle, msg.sender, token, contributionAmount, maxMembers, roundDuration);
    }

    function circleCount() external view returns (uint256) {
        return circles.length;
    }
}
