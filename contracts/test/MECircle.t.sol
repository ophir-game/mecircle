// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {Test} from "forge-std/Test.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {ReputationLedger} from "../src/ReputationLedger.sol";
import {SavingsCircle} from "../src/SavingsCircle.sol";
import {CircleFactory} from "../src/CircleFactory.sol";

contract MECircleTest is Test {
    AttestationRegistry internal registry;
    CircleFactory internal factory;
    ReputationLedger internal ledger;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal carol = address(0xCA401);
    address internal dave = address(0xDA9E); // never attested in setUp

    uint256 internal constant CONTRIBUTION = 1 ether;
    uint256 internal constant ROUND_DURATION = 1 days;

    function setUp() public {
        registry = new AttestationRegistry();
        factory = new CircleFactory(address(registry));
        ledger = factory.ledger();

        registry.attest(alice);
        registry.attest(bob);
        registry.attest(carol);

        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(carol, 10 ether);
        vm.deal(dave, 10 ether);
    }

    function _createCircle() internal returns (SavingsCircle circle) {
        circle = SavingsCircle(
            factory.createCircle(CONTRIBUTION, 3, ROUND_DURATION, address(0))
        );
    }

    function _join(SavingsCircle circle, address who) internal {
        vm.prank(who);
        circle.join();
    }

    function _deposit(SavingsCircle circle, address who) internal {
        vm.prank(who);
        circle.deposit{value: CONTRIBUTION}();
    }

    function _fillCircle(SavingsCircle circle) internal {
        _join(circle, alice);
        _join(circle, bob);
        _join(circle, carol);
    }

    // --- attestation gate -----------------------------------------------------

    function testAttestationGateRejectsUnverified() public {
        SavingsCircle circle = _createCircle();
        vm.prank(dave);
        vm.expectRevert("SC: ME ID not verified");
        circle.join();
    }

    function testRevokeBlocksJoin() public {
        SavingsCircle circle = _createCircle();
        registry.revoke(bob);
        vm.prank(bob);
        vm.expectRevert("SC: ME ID not verified");
        circle.join();
    }

    function testOnlyAttestorCanAttest() public {
        vm.prank(dave);
        vm.expectRevert("AR: not attestor");
        registry.attest(dave);
    }

    // --- membership -------------------------------------------------------------

    function testDuplicateJoinReverts() public {
        SavingsCircle circle = _createCircle();
        _join(circle, alice);
        vm.prank(alice);
        vm.expectRevert("SC: already a member");
        circle.join();
    }

    function testCircleActivatesOnlyWhenFull() public {
        SavingsCircle circle = _createCircle();
        _join(circle, alice);
        _join(circle, bob);
        assertEq(uint256(circle.phase()), uint256(SavingsCircle.Phase.Forming));
        vm.prank(alice);
        vm.expectRevert("SC: not active");
        circle.deposit{value: CONTRIBUTION}();

        _join(circle, carol);
        assertEq(uint256(circle.phase()), uint256(SavingsCircle.Phase.Active));
        assertEq(circle.currentRound(), 1);
        assertEq(circle.memberCount(), 3);
    }

    function testLeaveWhileForming() public {
        SavingsCircle circle = SavingsCircle(
            factory.createCircle(CONTRIBUTION, 2, ROUND_DURATION, address(0))
        );
        _join(circle, alice);
        vm.prank(alice);
        circle.leave();
        assertEq(circle.memberCount(), 0);
        assertFalse(circle.isMember(alice));

        _join(circle, bob);
        _join(circle, carol);
        assertEq(uint256(circle.phase()), uint256(SavingsCircle.Phase.Active));
        assertEq(circle.getMembers()[0], bob);
        assertEq(circle.getMembers()[1], carol);
    }

    // --- deposits -----------------------------------------------------------------

    function testWrongAmountReverts() public {
        SavingsCircle circle = _createCircle();
        _fillCircle(circle);
        vm.prank(alice);
        vm.expectRevert("SC: wrong amount");
        circle.deposit{value: CONTRIBUTION - 1}();
    }

    function testDoubleDepositReverts() public {
        SavingsCircle circle = _createCircle();
        _fillCircle(circle);
        _deposit(circle, alice);
        vm.prank(alice);
        vm.expectRevert("SC: already deposited");
        circle.deposit{value: CONTRIBUTION}();
    }

    function testNonMemberCannotDeposit() public {
        SavingsCircle circle = _createCircle();
        _fillCircle(circle);
        vm.prank(dave);
        vm.expectRevert("SC: not a member");
        circle.deposit{value: CONTRIBUTION}();
    }

    function testAdvanceTooEarlyReverts() public {
        SavingsCircle circle = _createCircle();
        _fillCircle(circle);
        _deposit(circle, alice);
        _deposit(circle, bob);
        vm.expectRevert("SC: round still open");
        circle.advanceRound();
    }

    // --- full lifecycle with a default ---------------------------------------------

    function testFullLifecycleWithDefault() public {
        SavingsCircle circle = _createCircle();
        _fillCircle(circle);

        // Round 1: everyone deposits, pot of 3 goes to alice (first member).
        _deposit(circle, alice);
        _deposit(circle, bob);
        _deposit(circle, carol);
        circle.advanceRound();
        assertEq(alice.balance, 12 ether);
        assertEq(circle.currentRound(), 2);

        // Round 2: alice defaults; round closed after the deadline.
        // Pot is only what was collected (2), paid to bob.
        _deposit(circle, bob);
        _deposit(circle, carol);
        vm.warp(block.timestamp + ROUND_DURATION + 1);
        circle.advanceRound();
        assertEq(bob.balance, 10 ether); // 10 - 1 (r1) - 1 (r2) + 2 (pot)
        assertEq(circle.currentRound(), 3);

        // Round 3: everyone deposits, pot of 3 goes to carol, circle completes.
        _deposit(circle, alice);
        _deposit(circle, bob);
        _deposit(circle, carol);
        circle.advanceRound();

        assertEq(uint256(circle.phase()), uint256(SavingsCircle.Phase.Completed));
        assertEq(carol.balance, 10 ether); // 10 - 1 - 1 - 1 + 3
        assertEq(alice.balance, 11 ether); // 12 - 1 (r3)
        assertEq(address(circle).balance, 0, "no funds may remain locked");

        // Reputation: alice defaulted once, everyone completed the circle.
        (uint256 onTime, uint256 defaults, uint256 completed) = ledger.reputationOf(alice);
        assertEq(onTime, 2);
        assertEq(defaults, 1);
        assertEq(completed, 1);

        (onTime, defaults, completed) = ledger.reputationOf(bob);
        assertEq(onTime, 3);
        assertEq(defaults, 0);
        assertEq(completed, 1);

        (onTime, defaults, completed) = ledger.reputationOf(carol);
        assertEq(onTime, 3);
        assertEq(defaults, 0);
        assertEq(completed, 1);
    }

    function testRecipientPaidEvenWhenDefaultingInOwnRound() public {
        SavingsCircle circle = _createCircle();
        _fillCircle(circle);

        // Round 1 (alice's pot): alice does NOT deposit; bob and carol do.
        _deposit(circle, bob);
        _deposit(circle, carol);
        vm.warp(block.timestamp + ROUND_DURATION + 1);
        circle.advanceRound();

        // Alice still receives the collected pot of 2, but the default is recorded.
        assertEq(alice.balance, 12 ether);
        assertEq(ledger.roundsDefaulted(alice), 1);
        assertEq(ledger.roundsOnTime(alice), 0);
    }

    // --- factory validation -----------------------------------------------------------

    function testFactoryValidation() public {
        vm.expectRevert("CF: contribution must be > 0");
        factory.createCircle(0, 3, ROUND_DURATION, address(0));

        vm.expectRevert("CF: member count out of range");
        factory.createCircle(CONTRIBUTION, 1, ROUND_DURATION, address(0));

        vm.expectRevert("CF: member count out of range");
        factory.createCircle(CONTRIBUTION, 51, ROUND_DURATION, address(0));

        vm.expectRevert("CF: round duration must be > 0");
        factory.createCircle(CONTRIBUTION, 3, 0, address(0));
    }

    function testLedgerRejectsNonWriter() public {
        vm.prank(dave);
        vm.expectRevert("RL: not writer");
        ledger.recordOnTime(dave);
    }

    // --- ERC20 circle ---------------------------------------------------------------

    function testTokenCircleLifecycle() public {
        MockERC20 token = new MockERC20();
        token.mint(alice, 1_000);
        token.mint(bob, 1_000);

        SavingsCircle circle = SavingsCircle(
            factory.createCircle(100, 2, ROUND_DURATION, address(token))
        );
        _join(circle, alice);
        _join(circle, bob);

        // Round 1: both deposit 100 tokens, pot of 200 goes to alice.
        vm.prank(alice);
        token.approve(address(circle), 100);
        vm.prank(alice);
        circle.deposit();
        vm.prank(bob);
        token.approve(address(circle), 100);
        vm.prank(bob);
        circle.deposit();
        circle.advanceRound();
        assertEq(token.balanceOf(alice), 1_100);
        assertEq(token.balanceOf(address(circle)), 0);

        // Round 2: both deposit again, pot of 200 goes to bob, circle completes.
        vm.prank(alice);
        token.approve(address(circle), 100);
        vm.prank(alice);
        circle.deposit();
        vm.prank(bob);
        token.approve(address(circle), 100);
        vm.prank(bob);
        circle.deposit();
        circle.advanceRound();

        assertEq(uint256(circle.phase()), uint256(SavingsCircle.Phase.Completed));
        assertEq(token.balanceOf(alice), 1_000);
        assertEq(token.balanceOf(bob), 1_000);
        assertEq(token.balanceOf(address(circle)), 0);
    }

    // --- deferred payout --------------------------------------------------------------

    function testDeferredPayoutDoesNotBrickCircle() public {
        RejectingMember rejector = new RejectingMember();
        registry.attest(address(rejector));
        vm.deal(address(rejector), 10 ether);

        SavingsCircle circle = SavingsCircle(
            factory.createCircle(CONTRIBUTION, 2, ROUND_DURATION, address(0))
        );
        rejector.join(circle); // joins first -> round 1 recipient
        _join(circle, alice);

        // Round 1: both deposit; the push to rejector fails and is credited.
        rejector.deposit(circle, CONTRIBUTION);
        _deposit(circle, alice);
        circle.advanceRound();
        assertEq(circle.pendingWithdrawals(address(rejector)), 2 ether);
        assertEq(circle.currentRound(), 2, "circle must keep moving");

        // Round 2: both deposit; alice receives her pot; circle completes.
        rejector.deposit(circle, CONTRIBUTION);
        _deposit(circle, alice);
        circle.advanceRound();
        assertEq(uint256(circle.phase()), uint256(SavingsCircle.Phase.Completed));
        assertEq(alice.balance, 10 ether);

        // Once the recipient can accept payments, the deferred pot is pulled.
        rejector.setAccepts(true);
        rejector.withdrawFrom(circle);
        assertEq(address(rejector).balance, 10 ether); // 10 - 1 - 1 + 2
        assertEq(circle.pendingWithdrawals(address(rejector)), 0);
        assertEq(address(circle).balance, 0);
    }
}

/// @dev Minimal ERC20 mock (standard transfer/transferFrom semantics).
contract MockERC20 {
    string public name = "Mock MEC";
    string public symbol = "mMEC";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @dev Circle member whose receive() rejects native coin until toggled on.
contract RejectingMember {
    bool public accepts;

    function setAccepts(bool value) external {
        accepts = value;
    }

    receive() external payable {
        require(accepts, "payments rejected");
    }

    function join(SavingsCircle circle) external {
        circle.join();
    }

    function deposit(SavingsCircle circle, uint256 amount) external {
        circle.deposit{value: amount}();
    }

    function withdrawFrom(SavingsCircle circle) external {
        circle.withdraw();
    }
}
