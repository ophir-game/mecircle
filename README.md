# MECircle

**Identity-gated rotating savings circles (ROSCA) on ME Network — where the collateral is your verified identity and your on-chain reputation, not your assets.**

🔗 **Live demo (ME Network testnet):** https://mecircle.fcfs.workers.dev
📄 **Submission document:** [SUBMISSION.md](./SUBMISSION.md) · **Run records:** [DEPLOYMENT.md](./DEPLOYMENT.md)
🏆 Built for **MetaEarth Hackathon 2026: HARBOR** — track *On-chain finance and trading*. Team: **MECircle** (captain Widodo Saputro).

---

## The problem

The rotating savings and credit association (ROSCA) is one of the oldest and
most widely used financial instruments on earth. It is called *arisan* in
Indonesia, *susu* in West Africa and the Caribbean, *chama* in East Africa,
*tanda* in Mexico, *chit fund* in India, *hui* in China. Hundreds of millions
of people — a large share of the adult population in many emerging economies —
save and borrow through these circles, and informal rotating savings move an
estimated tens of billions of dollars every year.

The mechanics are beautifully simple: a fixed group each contributes the same
amount every round, and the whole pot goes to one member, rotating until
everyone has received it once. No interest, no paperwork, no bank.

The failure mode is equally simple: **trust is enforced by nothing but social
pressure.** The member who receives the first pot can disappear. A member who
stops paying cannot be made to pay. There is no record that follows a defaulter
to the next circle, the next village, or the next app — so every new circle
starts from zero trust, stays small, and stays local.

## The solution

MECircle puts the ROSCA on ME Network and replaces social pressure with two
things only Meta Earth can provide natively:

1. **ME ID as the entry gate.** A wallet may join a circle only if it is
   attested as holding a verified ME ID (Advanced Verification). One person =
   one verified identity = one seat. You cannot run from a default and
   re-register under a fresh name, because the identity is the account.
2. **A permanent, public reputation ledger.** Every on-time contribution,
   every default, and every completed circle is written on-chain against the
   member's address — forever, and visible to every future circle.

On top of that gate, the money itself needs no trust at all:

- Contributions are locked in the circle contract; **the pot of each round is
  paid out automatically** in join order.
- **No admin, owner, or factory function can move members' funds — ever.**
  There is deliberately no withdrawal function for anyone but a member
  claiming their own deferred payout.
- The pot is exactly what the round collected, so the contract balance
  returns to zero after every round **by construction** — nothing can be left
  locked, skimmed, or stranded.

## Core features

| Feature | Where |
| --- | --- |
| ME ID attestation gate (join requires a verified ME ID) | `AttestationRegistry` |
| One-command circle creation, wired to shared registry + ledger | `CircleFactory` |
| Rotating pot payouts, per-round deposits, permissionless round closing | `SavingsCircle` |
| Permanent reputation: on-time rounds, defaults, completed circles | `ReputationLedger` |
| Deferred-payout safety net: a failed payout becomes a pull-claim, never a bricked circle | `SavingsCircle.pendingWithdrawals` |
| Live web demo: read all circle state from chain, create/join/deposit from a browser wallet | `site/` |

### How a circle works

1. Anyone creates a circle: fixed contribution, 2–50 seats, round length,
   native MEC (or any ERC20).
2. Verified members join — one seat per address. The circle **activates
   automatically when the last seat is taken**; round 1 starts immediately.
3. Each round, every member deposits exactly the contribution amount.
4. Anyone may call `advanceRound()` once everyone has deposited or the round
   deadline has passed. The contract records on-time/default marks in the
   reputation ledger, pays the pot to the member whose turn it is, and opens
   the next round. After the final round the circle completes and every
   member's completion is recorded.

### Design decisions (deliberate, and documented in the code)

- **Default ≠ ejection.** A member who misses a round is marked defaulted —
  permanently — but keeps their seat and their payout turn. This matches real
  ROSCA practice and keeps one bad round from collapsing the whole circle.
- **The pot is what was collected**, not a promised fixed sum. A recipient is
  paid even if they defaulted in their own payout round (standard ROSCA
  practice); the default still lands on their permanent record.
- **Attestation is checked at join time only.** Revoking an attestation
  mid-circle does not eject a member; it only blocks future joins.
- **Failed payout ≠ bricked circle.** If pushing the pot fails (e.g. a
  recipient contract that rejects native coin), the amount is credited to
  `pendingWithdrawals[recipient]` and the circle moves on; the recipient
  pulls it later with `withdraw()`.

## How ME Network and ME ID are used

ME ID verification itself happens where it belongs: **inside ME Pass**, via
the ME Pass JSBridge (`getUserInfo()` → `authStatus`), where Meta Earth
performs the real-person / Advanced Verification check. A smart contract
cannot call ME Pass, so MECircle uses an honest bridge:

```
ME Pass (JSBridge authStatus) ──► attestor (relayer) ──► AttestationRegistry.attest(wallet)
                                                              │
SavingsCircle.join() ──► AttestationRegistry.isVerified(wallet) must be true
```

- The **attestor** is an authorized account (registry owner or an added
  attestor) that records on-chain *which wallets passed ME ID verification in
  ME Pass*. The registry stores attestations — it never claims to perform KYC
  itself.
- **Joining is enforced on-chain**: `SavingsCircle.join()` reverts unless
  `isVerified(msg.sender)` is true. Revocation is likewise on-chain and takes
  effect for all future joins immediately.
- The trust assumption is explicit and minimal: the registry is only as
  trustworthy as its attestor set. The production path is a dedicated relayer
  key fed by the ME Pass mini-program flow (and, once available, listing in
  the ME Pass Ecosystem App Wall); the contract layer does not change.
- All value movement is in **MEC on ME Network** — contributions, pots, and
  reputation are native to the chain whose identity layer gates them.

## Contract architecture

Solidity `0.8.17` (the newest version ME Network's Ethermint supports),
Foundry project, no external contract dependencies (forge-std is test-only).

| Contract | Role |
| --- | --- |
| `AttestationRegistry` | ME ID gate. Authorized attestors record which wallets passed ME ID Advanced verification: `attest` / `revoke` / `isVerified`. |
| `CircleFactory` | Creates circles wired to the shared registry + ledger; deploys the `ReputationLedger`; authorizes each new circle as a reputation writer. Holds no funds. |
| `SavingsCircle` | One ROSCA circle: join → per-round deposits → rotating pot payouts → completion. Hand-rolled reentrancy guard, strict checks-effects-interactions, events for every material action. |
| `ReputationLedger` | Public permanent reputation per address (`roundsOnTime`, `roundsDefaulted`, `circlesCompleted`). Only factory-created circles may write. |

Full contract documentation: [contracts/README.md](./contracts/README.md).

## Deployed on ME Network testnet (chain ID 400)

RPC: `http://118.175.0.249:8545` · Deployed and end-to-end verified 19 Nov 2026.

| Contract | Address |
| --- | --- |
| AttestationRegistry | `0x00Bb9923F4f9a5f163A2735698aa309B7cD7d841` |
| CircleFactory | `0x7d75DEAde0403e5149fE20724EA7EBeE1092D446` |
| ReputationLedger | `0x7E60fc18A89fEE1f3e59D1db2C2d8D0B41bc7204` |
| SavingsCircle #1 (completed e2e run) | `0xDD8F1B8d8Ccaf4C253171768d5077b0E202A6E10` |

**End-to-end proof already on-chain:** a 3-member × 3-round circle ran to
completion — every pot (0.03 MEC) paid exactly, final circle balance 0, all
three members at reputation **3 on-time / 0 defaults / 1 circle completed**.
A second, long-running demo circle (7-day rounds) is live on the factory so
judges can watch an active circle with a collected pot. Every transaction
hash is in [DEPLOYMENT.md](./DEPLOYMENT.md).

## Run it yourself

```bash
# 1. Contract tests (16 tests, all passing)
cd contracts && forge test

# 2. Live demo — open the deployed site (reads chain state directly):
#    https://mecircle.fcfs.workers.dev
#    …or serve site/ statically; it talks to the contracts through the
#    RPC proxy in site-worker/ (the testnet RPC is plain HTTP, so an
#    HTTPS page cannot call it directly).

# 3. Re-verify the deployment against the live chain at any time:
node deploy/verify.mjs     # independent read-back of the e2e run
node deploy/check.mjs      # chain ID, gas price, wallet balances
```

The deployment itself is scripted and resumable (`deploy/deploy.mjs`,
`deploy/circle2.mjs`); wallet keys for the testnet deployer/members are local
chmod-600 files that are **never** committed (see `.gitignore`).

## Security notes

- No admin, owner, or factory function can move a circle's funds; the only
  outbound paths are the round pot (to the scheduled member) and
  `withdraw()` of a member's own deferred payout.
- Hand-rolled reentrancy guard on `deposit` / `advanceRound` / `withdraw`;
  payouts are the last step of `advanceRound()`.
- The reputation loop in `advanceRound()` iterates over members — bounded by
  the factory's 50-member cap.
- Fee-on-transfer ERC20 tokens are rejected by exact-amount verification on
  deposit.

## Roadmap

1. **ME Pass mini-program listing** — join flow inside ME Pass: read
   `authStatus` via JSBridge, hand off to the attestor relayer, then join —
   the exact flow the registry was designed for.
2. **Dedicated attestor relayer** with its own key and rate limits (the
   registry already supports multiple attestors).
3. **Reputation-aware circles** — creators may set a minimum reputation
   (e.g. ≥ 5 on-time rounds, 0 defaults) as a join condition, turning the
   ledger into portable credit history.
4. **Mainnet deployment** on ME Network with MEC circles for real arisan,
   chama, and susu groups, plus multi-token support.
