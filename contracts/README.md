# MECircle — Contracts

On-chain core of **MECircle** (MetaEarth HARBOR hackathon, Concept A):
identity-gated rotating savings circles (ROSCA / arisan) on ME Network.
Solidity `0.8.17` (the newest version ME Network's Ethermint supports),
Foundry project, no external contract dependencies (forge-std is test-only).

**Status: DEPLOYED + end-to-end verified on ME Network testnet** (EVM chain
ID 400, RPC `http://118.175.0.249:8545`) — 19 Nov 2026. A full 3-member ×
3-round circle ran to completion on-chain (see `../DEPLOYMENT.md` for every
transaction hash and the independent read-back verification).

| Contract | Address |
| --- | --- |
| AttestationRegistry | `0x00Bb9923F4f9a5f163A2735698aa309B7cD7d841` |
| CircleFactory | `0x7d75DEAde0403e5149fE20724EA7EBeE1092D446` |
| ReputationLedger | `0x7E60fc18A89fEE1f3e59D1db2C2d8D0B41bc7204` |
| SavingsCircle #1 (completed e2e) | `0xDD8F1B8d8Ccaf4C253171768d5077b0E202A6E10` |

**Live frontend:** https://mecircle.fcfs.workers.dev — reads circle state
directly from these contracts and exposes create / join / deposit /
advance / withdraw through a browser wallet (source in `../site/`).

## Contracts

| File | Role |
| --- | --- |
| `src/AttestationRegistry.sol` | ME ID gate. A trusted attestor (owner or an added attestor — the app backend/relayer that checked `authStatus` via the ME Pass JSBridge) records which wallets passed ME ID Advanced verification: `attest` / `revoke` / `isVerified`. |
| `src/ReputationLedger.sol` | Public permanent reputation per address: `roundsOnTime`, `roundsDefaulted`, `circlesCompleted`. Only circles created by the factory may write. |
| `src/SavingsCircle.sol` | One ROSCA circle: join → per-round deposits → rotating pot payouts → completion. |
| `src/CircleFactory.sol` | Deploys the shared `ReputationLedger`, creates circles wired to the shared registry + ledger, authorizes each new circle as a reputation writer. Holds no funds. |

## How a circle works

1. `CircleFactory.createCircle(contributionAmount, maxMembers, roundDuration, token)`
   — `token = address(0)` means the native coin (MEC); otherwise an ERC20.
   Bounds: contribution > 0, 2 ≤ members ≤ 50, duration > 0.
2. **Joining** is free and gated: `AttestationRegistry.isVerified(msg.sender)`
   must be true; one seat per address. The circle **activates automatically
   when the last seat is taken**; round 1 starts at that moment. Members may
   `leave()` while the circle is still forming (no funds are held yet).
3. **Each round**, every member deposits exactly `contributionAmount` once
   via `deposit()`.
4. **`advanceRound()`** (permissionless — anyone may call) closes a round once
   either everyone has deposited or `roundDeadline` has passed. It:
   - records on-time / default in the `ReputationLedger` for every member,
   - pays the pot to the member whose turn it is (join order, round 1 →
     first member, …),
   - opens the next round, or completes the circle after the final round
     (rounds = members) and records a completion for every member.

## Rules for defaults and leftover funds (explicit design choices)

- **Default ≠ ejection.** A member who misses a round is recorded as
  defaulted for that round but keeps their seat and their payout turn.
- **The pot is what was actually collected** that round
  (`contributionAmount × deposits made`), not a promised fixed amount.
  A recipient therefore receives their pot **even if they defaulted in
  their own payout round** (standard ROSCA practice) — reduced by whatever
  the round failed to collect, and with the default permanently on their
  reputation record.
- **No leftover funds by construction.** Every round pays out exactly what
  it collected, so the circle's balance returns to zero after each round
  and nothing can remain locked at completion. (Native coin force-sent to
  the contract outside `deposit()` — e.g. via `selfdestruct` — is the only
  exception; it is not members' money and there is deliberately no admin
  function that could touch it.)
- **Failed payout ≠ bricked circle.** If pushing the pot fails (e.g. a
  recipient contract rejecting native coin), the amount is credited to
  `pendingWithdrawals[recipient]` and the circle moves on; the recipient
  pulls it later with `withdraw()`.
- **Attestation is checked at join time only.** Revoking a member's
  attestation mid-circle does not eject them; it only blocks future joins.
- **Fee-on-transfer ERC20 tokens are not supported**: token deposits verify
  the exact received amount and revert otherwise.

## Security notes

- Hand-rolled reentrancy guard on `deposit` / `advanceRound` / `withdraw`;
  strict checks-effects-interactions; payouts are the last step.
- No admin, owner, or factory function can move a circle's funds.
- The reputation loop in `advanceRound()` iterates over members — bounded
  by the factory's 50-member cap.
- Events are emitted for every material action (join, leave, activation,
  deposit, round advance, payout, deferred payout, withdrawal, completion,
  attestation changes, reputation writes).

## Test

```bash
forge test        # 16 tests, all passing
```

Coverage highlights: attestation gate (unverified + revoked joins revert),
activation only when full, leave-while-forming, wrong-amount / double /
non-member deposits, early `advanceRound()` revert, a full 3-member
lifecycle with a mid-circle default (balances + reputation asserted, final
contract balance = 0), recipient paid despite defaulting in their own
round, a full ERC20-token circle, and the deferred-payout → withdraw path
with a payment-rejecting member.

## Known limitations / next steps

- ME ID verification itself happens off-chain (ME Pass JSBridge
  `getUserInfo()` → `authStatus`); the registry is only as trustworthy as
  its attestor set. Production should use a dedicated relayer key, not the
  owner key, as the day-to-day attestor.
- Deployment is testnet-only (chain 400). A mainnet deployment is a
  from-scratch run of `../deploy/deploy.mjs` against a mainnet endpoint —
  no contract changes are needed.
- The web frontend (`../site/`) is live; the ME Pass mini-program
  integration (join flow reading `authStatus` inside ME Pass and handing
  off to the attestor relayer, then listing in the Ecosystem App Wall) is
  the next build step.
