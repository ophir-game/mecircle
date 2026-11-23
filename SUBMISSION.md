# MECircle — HARBOR Submission

**Event:** MetaEarth Hackathon 2026: HARBOR (global edition)
**Track:** On-chain finance and trading
**Team:** MECircle — captain Widodo Saputro, 2 members, both ME ID Advanced verified
**Project:** MECircle — identity-gated rotating savings circles (ROSCA) on ME Network

This document maps the submission to the five official submission
requirements, then maps the judging criteria to concrete, checkable evidence.

---

## Requirement 1 — Project Description

### Target users

Members of rotating savings and credit associations (ROSCAs) — *arisan*
groups in Indonesia, *chama* in Kenya and East Africa, *susu* in West Africa
and the Caribbean diaspora, *tandas* in Mexico, chit funds in India — and the
much larger population that would use them if the trust problem were solved:
unbanked and underbanked savers, migrant workers sending value home through
informal groups, small community savings groups, and young first-time savers
who have a phone and an ME ID but no credit history and no collateral.

### Problem solved

ROSCAs move an estimated tens of billions of dollars a year for hundreds of
millions of people, on mechanics that have not changed in centuries: equal
contributions per round, the pot rotates to one member per round. Their single
point of failure is trust. The early recipient can abscond; a defaulter cannot
be compelled; and no record follows a defaulter, so every circle restarts from
zero trust, stays small, and stays local. Existing "digital arisan" apps solve
none of this — they reintroduce a custodial admin who holds the money, which
is a strictly worse trust problem.

### Core features

- **ME ID attestation gate** — a wallet joins a circle only if the
  `AttestationRegistry` records it as ME ID Advanced-verified. One person,
  one identity, one seat.
- **Trustless rotating pots** — contributions lock in `SavingsCircle`; each
  round's pot is paid automatically in join order. No admin ever holds or can
  move members' funds; there is no admin withdrawal path at all.
- **Permanent on-chain reputation** — `ReputationLedger` records on-time
  rounds, defaults, and completed circles against the member's address,
  publicly readable by any future circle.
- **Honest default handling** — default is recorded forever but does not
  eject the member or collapse the circle; the pot is what the round actually
  collected, so the contract balance returns to zero after every round by
  construction.
- **Deferred-payout safety net** — a payout that cannot be pushed is credited
  to `pendingWithdrawals` and pulled later by the member; one bad recipient
  can never brick a circle.

### ME access methods (how the project uses Meta Earth)

- **ME Network (EVM, chain 400 testnet)** hosts all four contracts; all value
  movement (contributions and pots) is in native MEC.
- **ME ID** is the trust layer: verification is performed by Meta Earth
  inside **ME Pass** (JSBridge `getUserInfo()` → `authStatus`); an authorized
  attestor records the result in the `AttestationRegistry`; `join()` enforces
  `isVerified` on-chain. The architecture — including exactly what the
  registry does and does not claim — is documented in
  [README.md](./README.md#how-me-network-and-me-id-are-used).
- **ME Pass mini-program / Ecosystem App Wall listing** is the designed
  production entry point (roadmap item 1 in README.md); the web demo below is
  the experience entry for this submission.

---

## Requirement 2 — Code Repository

- **Repository:** https://github.com/sdwous/mecircle (public).
- **Final commit at submission prep:** `d185aa57ff251dc96d4529d64876f4cede8ca440` (branch `main`; the submission-day final commit is the HEAD of `main` in this repository).
- **Final commit:** the commit at which this document was finalized for
  submission (see `git log -1`); contract code is frozen under `contracts/`.
- **Execution instructions:**
  ```bash
  cd contracts && forge build && forge test   # 16 tests, all passing
  node deploy/check.mjs                        # chain / balances sanity check
  node deploy/verify.mjs                       # independent on-chain read-back of the e2e run
  ```
  The live demo needs no local execution — see Requirement 4. Wallet key
  files for the testnet deployer/members are intentionally **not** in the
  repository (see `.gitignore`); they are local chmod-600 files.

---

## Requirement 3 — Demo Video

- **File:** `demo-video/mecircle-demo-v3.mp4` (v3, rebuilt 23 Nov 2026 after
  viewer-POV audits of v1 (5.5/10) and v2 (7.9/10); v3 audited ≈8.4/10 on the
  same rubric — v1/v2 files kept in the same release for reference)
- **Public link (permanent):**
  https://github.com/sdwous/mecircle/releases/download/demo-video/mecircle-demo-v3.mp4
  (GitHub Release `demo-video`, uploaded 23 Nov 2026; 4:07.6, 1920×1080)
- **Length:** 4:07.6 — within the required 3–5 minutes, English narration
  **and** burned-in English subtitles (both official options satisfied).
- **Contents:** the ROSCA trust problem → MECircle's answer → a tour of the
  live demo reading real chain state → the on-chain run records (completed
  circle, pots paid, reputation written) → the ME ID gate and reputation
  ledger → closing.

---

## Requirement 4 — Experience Mode

**Online Experience Entry:** https://mecircle.fcfs.workers.dev

A mobile-first web app that reads MECircle state **directly from the ME
Network testnet contracts** (through a same-origin RPC proxy — the testnet
RPC is plain HTTP, so the HTTPS page cannot call it directly; proxy source in
`site-worker/`):

- Factory overview: number of circles and every circle's live state.
- Per circle: phase (Forming / Active / Completed), members, contribution,
  current round, round deadline, deposits and pot collected this round,
  current pot recipient.
- Address checker: ME ID attestation status (`isVerified`) and reputation
  (on-time / defaulted / circles completed) for any address.
- Wallet interaction (any EIP-1193 wallet; the app adds chain 400
  automatically): create a circle, join, deposit, advance a round, withdraw
  a deferred payout. Without a wallet the app is a full read-only explorer.

Try it with the three attested demo addresses (all verified, reputation
3 / 0 / 1): `0x2BfeEbFd9Bb69e4EFd3783CC0609A4b66A7cCD54`,
`0xDBa88Fa8c5ef558121998Bc11B880B62D0e51b82`,
`0xb9Cd22aD6DC474c7135faE4d88F5E97138a78250`.

**Local execution alternative:** serve the static files in `site/` with any
static file server and deploy `site-worker/worker-mecircle.js` (or point the
app at any chain-400 JSON-RPC endpoint).

---

## Requirement 5 — Run Records

Network: **ME Network testnet**, EVM chain ID **400**, RPC
`http://118.175.0.249:8545`. Full record with every transaction:
[DEPLOYMENT.md](./DEPLOYMENT.md).

### Contracts

| Contract | Address | Deploy tx |
| --- | --- | --- |
| AttestationRegistry | `0x00Bb9923F4f9a5f163A2735698aa309B7cD7d841` | `0x5c72f9dbec66eb99a50a2af90fddbf8147c4f9e89aa6a1f8b93d0c46f4472b2c` |
| CircleFactory | `0x7d75DEAde0403e5149fE20724EA7EBeE1092D446` | `0x92b7cadb95f6dc4b3136e08ed5fe3862656dd7493d7ced3f2b944bbab91fc32c` |
| ReputationLedger | `0x7E60fc18A89fEE1f3e59D1db2C2d8D0B41bc7204` | deployed by the CircleFactory constructor |
| SavingsCircle #1 | `0xDD8F1B8d8Ccaf4C253171768d5077b0E202A6E10` | via createCircle tx below |

### Key transactions — setup and Circle #1 (completed end-to-end run)

| Step | Tx |
| --- | --- |
| attest(deployer) | `0x149138763540aeee72671d9bc363dc3b57172b28e3febd09edbeb28307cd5b7a` |
| attest(member 1) | `0x2c9379367d2a1d8fa5eaf6a843d7fb6047be8e735f86ad82426582985f3da93b` |
| attest(member 2) | `0x0b590cacaa9c469ba00aecbe75df015a367f3d1a5595a217f796ed9d7356fde2` |
| createCircle(0.01 MEC, 3 seats, native) | `0x0261de87951f2e5731f46f471263c4ab5316601c162926b572a430ac2884739f` |
| join member 1 / member 2 / deployer | `0x51464588907cb10237a25851808dc0422ccbcf61b662c3298af961df78064b4d` / `0xb667c69ce8e6066da4ed56fce16abfc9d7f98e6180fc7d6775c0d24b0a982c87` / `0x9b49fa3f0bb7abd391c1f62448049fe48080df450dce866703a163d556cce976` |
| Round 1 advance (pot 0.03 MEC → member 1) | `0x8237c3940f58ea278aeeea65b76deb4a39939edba7042c4287842d768892a336` |
| Round 2 advance (pot 0.03 MEC → member 2) | `0x3be085577713794ce250e028752ab4dbeb5d1441cd09240fa7899679536e9537` |
| Round 3 advance (pot 0.03 MEC → deployer) | `0x863bf48ad061e7001567203147a69ab3d9faea90143956da0248154b268328af` |

(All 9 deposit transactions are listed in DEPLOYMENT.md.)

### Final on-chain verification (independent read-back, `deploy/verify.mjs`)

- Circle #1 `phase()` = **Completed**; circle balance = **0 MEC**;
  `pendingWithdrawals` = 0 for all members.
- `isVerified` = **true** for all three members.
- Reputation of all three members: **roundsOnTime 3, roundsDefaulted 0,
  circlesCompleted 1**.
- Factory `circleCount()` = 1 at the e2e check.

### Live demo circle (Circle #2, created 23 Nov 2026)

Created through the same factory so judges can inspect an **in-progress**
circle, not only the completed test run: SavingsCircle
`0x1b551f94d16759Fa9aF3Af0648E42108b1fa18f8` — 0.01 MEC contribution,
3 seats, 7-day rounds. All three members joined and deposited round 1;
`advanceRound()` was deliberately not called. Verified read-back:
**phase Active, round 1, deposits 3/3, pot collected 0.03 MEC held by the
contract**, round-1 deadline 2026-11-30T01:26:33Z, factory
`circleCount()` = 2. All seven transaction hashes are in DEPLOYMENT.md,
"Live demo circle (Circle #2)".

---

## Judging criteria — where the evidence is

### Technical Implementation (30)

- 4 contracts, Solidity 0.8.17, zero external dependencies; **16/16 Foundry
  tests pass** (`cd contracts && forge test`), covering the attestation gate
  (unverified and revoked joins revert), activation only when full,
  wrong-amount/double/non-member deposits, a full 3-member lifecycle with a
  mid-circle default (balances and reputation asserted, final balance 0), a
  recipient paid despite defaulting in their own round, a full ERC20-token
  circle, and the deferred-payout → withdraw path.
- Hand-rolled reentrancy guard, checks-effects-interactions, bounded loops
  (50-member cap), events for every material action.
- The system is not a mock-up: it is deployed and ran a complete lifecycle on
  ME Network testnet (Requirement 5), re-verifiable any time with
  `deploy/verify.mjs`.

### ME Application (25)

- ME ID is not decoration — it is the admission mechanic of the product:
  no verified ME ID, no seat. The attestation bridge (ME Pass JSBridge →
  attestor → on-chain registry → join-time enforcement) is the documented,
  honest way to bind ME Pass verification to EVM contract logic.
- All value flows are native MEC on ME Network; reputation accrues to the
  same identity that ME ID verifies, which is precisely Meta Earth's
  identity-plus-value thesis.

### Product Value (20)

- ROSCAs serve hundreds of millions of people and move an estimated tens of
  billions of dollars a year; their binding constraint is trust, and MECircle
  removes exactly that constraint without introducing a custodian.
- The design mirrors real ROSCA practice (default ≠ ejection, pot = collected
  amount), so it maps onto how arisan/chama/susu groups already behave —
  adoption does not require re-educating users about a new financial product.

### Innovation (15)

- Collateral-free credit backed by **identity and portable reputation**
  instead of assets: a default follows the defaulter's ME ID forever and is
  readable by every future circle — a primitive that does not exist in
  traditional ROSCAs or in custodial fintech versions of them.
- The deferred-payout pattern (push → credit → pull) makes rotating payouts
  robust against hostile or broken recipient contracts without any admin.

### User Experience (10)

- The live demo renders immediately and fills in chain state as it arrives
  (the testnet RPC can be slow; the page never blocks on it), works read-only
  with no wallet, and with a wallet adds chain 400 automatically and exposes
  every user action — create, join, deposit, advance, withdraw — with clear
  transaction status.
- Plain-language explanations of the circle lifecycle are built into the
  demo, aimed at the non-crypto ROSCA users who are the product's audience.
