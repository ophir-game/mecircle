# MECircle — ME Network Testnet Deployment

Status: **DEPLOYED + E2E VERIFIED** — 19 Nov 2026. Faucet claim landed
(exactly 2 MEC in the deployer), all contracts deployed, and a full
3-member / 3-round circle ran to completion on-chain. Full record in the
"Deployment record" section at the bottom of this file.

## Network (verified live, 19 Nov 2026)

- EVM JSON-RPC: `http://118.175.0.249:8545`
- EVM chain ID: **400** (`eth_chainId` → `0x190`)
- Block height at check: 5,396,531 (chain producing normally)

## Wallets (testnet-only, created fresh for this task)

Keys live ONLY in the chmod-600 files noted; never printed anywhere.

| Role | Address | Key file |
| --- | --- | --- |
| Deployer | `0xb9Cd22aD6DC474c7135faE4d88F5E97138a78250` · bech32: `me1h8xj9ttdc36vwy6l4exc3a0fwyu20qjs8zkr66` | `~/workspace/harbor/deployer.json` |
| Member 1 | `0x2BfeEbFd9Bb69e4EFd3783CC0609A4b66A7cCD54 · bech32: me190lwhlvmk60yalfhs0xqvzdyke48en25gxejgj` | `~/workspace/harbor/test-members.json` |
| Member 2 | `0xDBa88Fa8c5ef558121998Bc11B880B62D0e51b82 · bech32: me1mw5gl2x9aa2czgve30q3hzqtvtgw2xuzudr6dw` | `~/workspace/harbor/test-members.json` |

Balances at check: **all 0 MEC**. (Final balances after the e2e run are in
the deployment record below: deployer 1.89999985 MEC, members 0.04999996
MEC each.)

## Blocker: faucet requires a browser + Cloudflare Turnstile

The only official self-serve funding route is the web faucet:

- URL: https://www.mec.me/en-US/faucet
- Rules (from the page itself): **2 MEC per claim, 1 claim per address per
  day** (resets 00:00 UTC).
- The page loads **Cloudflare Turnstile**
  (`challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`) and the
  claim is a client-side app flow — there is no plain API endpoint to call
  from this VM, and the captcha cannot be completed headlessly.
- Official docs list only two other routes, both manual: apply in the
  community Discord, or contact the dev team (devsupport@mec.me).

### Exact unblock action (one browser visit, ~1 minute)

1. Open https://www.mec.me/en-US/faucet in a browser.
2. Enter the **deployer** address
   `me1h8xj9ttdc36vwy6l4exc3a0fwyu20qjs8zkr66` (the faucet REJECTS 0x format with "ME Chain address format error" — learned from the failed browser claim attempt 19 Nov 09:29 WIB), complete the Turnstile
   verification, and Claim → **2 MEC** lands in the deployer wallet.
   (Claiming for the deployer alone is enough: gas on this chain is tiny
   and the circle deposits are 0.01 MEC — the deployer can fund both
   member wallets afterwards. Claiming for the two member addresses too
   also works and skips the funding transfers.)
3. Say "lanjut" — deployment resumes from the deploy step below.

## Remaining plan (EXECUTED 19 Nov 2026 — see deployment record below)

1. Deploy `AttestationRegistry` (no constructor args; deployer = owner/attestor).
2. Deploy `CircleFactory(registry)` — deploys the shared `ReputationLedger`.
3. Deployer funds member1 + member2 (small transfers).
4. E2E on-chain: `attest` deployer + both members → `createCircle`
   (3 seats, 0.01 MEC contribution, short round duration, native token) →
   all 3 `join()` (circle activates) → all 3 `deposit()` round 1 →
   `advanceRound()` → verify pot (0.03 MEC) landed with member 1 (round-1
   recipient) → final `eth_call` proof: `isVerified` for all three +
   reputation counters (`roundsOnTime`, `circlesCompleted` after full run).
5. Record contract addresses, all tx hashes, and final balances here.

## Contracts / tx hashes

- AttestationRegistry: `0x00Bb9923F4f9a5f163A2735698aa309B7cD7d841`
- CircleFactory: `0x7d75DEAde0403e5149fE20724EA7EBeE1092D446`
- ReputationLedger: `0x7E60fc18A89fEE1f3e59D1db2C2d8D0B41bc7204`
- SavingsCircle (e2e test circle): `0xDD8F1B8d8Ccaf4C253171768d5077b0E202A6E10`
- Tx hashes: full list in the deployment record below.

## Deployment record (19 Nov 2026, executed)

Runner: `~/workspace/harbor/deploy/deploy.mjs` (raw JSON-RPC + local
signing via ethers; resumable state in `deploy/state.json`), final
independent verification by `~/workspace/harbor/deploy/verify.mjs`.

### Deployed contracts (ME Network testnet, chain ID 400)

| Contract | Address | Deploy tx |
| --- | --- | --- |
| AttestationRegistry | `0x00Bb9923F4f9a5f163A2735698aa309B7cD7d841` | `0x5c72f9dbec66eb99a50a2af90fddbf8147c4f9e89aa6a1f8b93d0c46f4472b2c` |
| CircleFactory | `0x7d75DEAde0403e5149fE20724EA7EBeE1092D446` | `0x92b7cadb95f6dc4b3136e08ed5fe3862656dd7493d7ced3f2b944bbab91fc32c` |
| ReputationLedger | `0x7E60fc18A89fEE1f3e59D1db2C2d8D0B41bc7204` | (deployed by CircleFactory constructor) |
| SavingsCircle #1 | `0xDD8F1B8d8Ccaf4C253171768d5077b0E202A6E10` | via createCircle tx below |

Verified on-chain after deploy: registry `owner()` = deployer;
factory `registry()` = registry; ledger `admin()` = factory.

### Setup txs

| Step | Tx |
| --- | --- |
| Fund Member 1 (0.05 MEC) | `0xb36e27f43933d138a5f1c1d2dfb30d1447bf112cf8ee027019083eb1a8e38e5f` |
| Fund Member 2 (0.05 MEC) | `0x699052b451545a908db8343d78b345ddb4d077ea65f8ff3277a39cee3591c5aa` |
| attest(deployer) | `0x149138763540aeee72671d9bc363dc3b57172b28e3febd09edbeb28307cd5b7a` |
| attest(member1) | `0x2c9379367d2a1d8fa5eaf6a843d7fb6047be8e735f86ad82426582985f3da93b` |
| attest(member2) | `0x0b590cacaa9c469ba00aecbe75df015a367f3d1a5595a217f796ed9d7356fde2` |
| createCircle(0.01 MEC, 3 seats, 3600 s, native) | `0x0261de87951f2e5731f46f471263c4ab5316601c162926b572a430ac2884739f` |
| join member1 (seat 1) | `0x51464588907cb10237a25851808dc0422ccbcf61b662c3298af961df78064b4d` |
| join member2 (seat 2) | `0xb667c69ce8e6066da4ed56fce16abfc9d7f98e6180fc7d6775c0d24b0a982c87` |
| join deployer (seat 3 → circle Active) | `0x9b49fa3f0bb7abd391c1f62448049fe48080df450dce866703a163d556cce976` |

### E2E circle run (3 members × 3 rounds, 0.01 MEC/round)

| Round | Deposits (member1 / member2 / deployer) | advanceRound | Pot check |
| --- | --- | --- | --- |
| 1 | `0xe5acd918498ac301c470a56a593bab7419ef8ea63d228969f11f7af8f593dd6d` / `0xee3d302ae2060eb5da33b80b1a2a10839b3249b42338ca915d8e35fb1b70face` / `0xa3f60cab2eab7da07df8acde75ed050b66f989d6d1283e0ef38b3cbd286c47e2` | `0x8237c3940f58ea278aeeea65b76deb4a39939edba7042c4287842d768892a336` | Member 1 balance delta **exactly +0.03 MEC** ✓ |
| 2 | `0x1325985f3b062cbccb03cff15b26dc53c3ec04593646042c2b1fdf057038153f` / `0x62183d5470ae35a297daba25fee0318355d8dfd4c24f7d655ffebca916eaffa7` / `0x8ef8db510ec56ca6937da07a2ae96f4a30e3d13ef10a6b779c165de252e68f7c` | `0x3be085577713794ce250e028752ab4dbeb5d1441cd09240fa7899679536e9537` | Member 2 balance delta **exactly +0.03 MEC** ✓ |
| 3 | `0xb2613f1a0d1481258d503cc3673b923fd23845e9eae85ac88173fdc31995f292` / `0x2bfa8dd80ba463cfb4743a669d8f6d909a4995bc54f4e3f8233449cd13b13081` / `0xeb8b9e34e3caf803d18c650529b475dfcf2687f88c859d76c2b79f9c36ca7e4e` | `0x863bf48ad061e7001567203147a69ab3d9faea90143956da0248154b268328af` | `RoundAdvanced` + `PotPaid` events confirm **0.03 MEC to deployer** ✓ (see fee note) |

### Final on-chain verification (independent read-back, verify.mjs)

- Circle `phase()` = **Completed (2)**; circle balance = **0 MEC**;
  `pendingWithdrawals` = 0 for all three members.
- `isVerified` = **true** for deployer, member1, member2.
- Reputation (`reputationOf`) for **all three members**:
  roundsOnTime **3**, roundsDefaulted **0**, circlesCompleted **1**.
- Factory `circleCount()` = 1.
- Final balances: deployer **1.89999985 MEC**, member1 **0.04999996 MEC**,
  member2 **0.04999996 MEC**.

### Chain fee note (explains the only "failed" intermediate check)

`deploy.mjs` halted at its strict round-3 pot-delta check: the observed
delta was 0.03 − 10¹⁰ wei. Root cause, proven by reconciling all three
wallets to the wei: **this chain deducts a flat fee of exactly 10¹⁰ wei
(10⁻⁸ MEC) per transaction**, which exceeds `gasUsed × gasPrice`
(gasPrice = 7 wei) for every transaction in this run. Under that model
every final balance matches the on-chain read exactly (members: 4 txs
each → 0.05 − 4×10¹⁰ wei = 0.04999996; deployer: 15 txs →
2 − 0.10 funding − 0.03 deposits + 0.03 pot − 15×10¹⁰ wei = 1.89999985).
The round-3 pot itself is confirmed at the full 0.03 MEC by the
`RoundAdvanced`/`PotPaid` event logs in the advance receipt. Total real
spend for the whole deployment + e2e: ~0.00000023 MEC in fees — the 2 MEC
faucet budget was barely touched.

---

## Live demo circle (Circle #2) — 23 Nov 2026

A second circle was created through the same factory to serve as the
**live demo circle** for the submission: unlike Circle #1 (a short test
that already completed), Circle #2 uses 7-day rounds and is intentionally
left **Active in round 1 with the pot collected** — `advanceRound()` was
deliberately NOT called, so judges opening the demo see a real in-progress
circle holding real (testnet) funds.

Runner: `~/workspace/harbor/deploy/circle2.mjs` (same resumable pattern as
`deploy.mjs`; state under the `circle2` key in `deploy/state.json`).
The three members are the same attested test wallets as Circle #1 — no new
attestations were needed.

### Parameters

| Item | Value |
| --- | --- |
| SavingsCircle #2 | `0x1b551f94d16759Fa9aF3Af0648E42108b1fa18f8` |
| Contribution | 0.01 MEC per member per round (native) |
| Seats | 3 (member1, member2, deployer — join order = payout order) |
| Members | member1 `0x2BfeEbFd9Bb69e4EFd3783CC0609A4b66A7cCD54`, member2 `0xDBa88Fa8c5ef558121998Bc11B880B62D0e51b82`, deployer `0xb9Cd22aD6DC474c7135faE4d88F5E97138a78250` |
| Round duration | 604,800 s (7 days) |
| Round 1 deadline | 2026-11-30T01:26:33Z (unix 1796001993) |

### Transactions

| Step | Tx |
| --- | --- |
| createCircle(0.01 MEC, 3 seats, 604800 s, native) | `0xe8be5c8940480de855712088601c99133178fcfa1ec5e939cd3ab4d8cbfd111e` |
| join member1 (seat 1) | `0x8558f1214dde02ca12776c4d77d5fb469ac27ff48520bc2aad0db57c6b96d642` |
| join member2 (seat 2) | `0xcc3b9c24622fb6a9db54bab2675d4bf90ac65daa1c0dad9450097a69eb369fb4` |
| join deployer (seat 3 → circle Active) | `0x27a32b1bcc836b28ab123938c032947bb2860fc24f154b9f34840df64435bd81` |
| deposit round 1 — member1 | `0x8a51a095142027a6a512547ffba475745f663188e7db92bec2f85b9a735b64a2` |
| deposit round 1 — member2 | `0x36619b57b7e15c53c8f6efa0940f439049203f6d86b3af66f5be5c1ad00c3d1f` |
| deposit round 1 — deployer | `0x7e24e70b833a034b7ef6612fa7e8bb5b859c105ee0efc0e79c54184ca811df24` |

Note: the first `circle2.mjs` run was interrupted after the member
deposits had landed on-chain but before their hashes were saved; the two
member deposit hashes above were recovered from the `DepositMade` event
logs (blocks 5466421 and 5466426) and confirmed by `hasDeposited`
read-back. The deployer deposit's send call likewise returned an
ambiguous RPC error, but the transaction had landed — proven on-chain
(block 5466431, nonce 17, value exactly 0.01 MEC, receipt status 1,
`hasDeposited(1, deployer)` = true); no duplicate deposit was sent.

### Final verification (independent read-back, fresh provider)

- `phase()` = **Active (1)**; `memberCount()` = **3** in join order
  [member1, member2, deployer]; `currentRound()` = **1**.
- `depositsThisRound()` = **3**; `collectedThisRound()` = **0.03 MEC**;
  circle contract balance = **0.03 MEC**.
- `hasDeposited(1, ·)` = **true** for all three members.
- `roundDeadline()` = 1796001993 (activation + 604,800 s), still in the
  future at verification time.
- Factory `circleCount()` = **2**.
- Final balances: deployer **1.88999982 MEC**, member1 **0.03999994 MEC**,
  member2 **0.03999994 MEC** (deposits of 0.01 MEC each plus the chain's
  flat 10¹⁰-wei-per-tx fee account for the deltas).
