// MECircle TAHAP 3 — "live demo circle" (Circle #2) on ME Network testnet.
// Creates a second circle, fills it, deposits round 1, and STOPS (no
// advanceRound) so the circle hangs Active with a collected pot for judges.
// Resumable via state.json under the NEW key `circle2` — circle #1 keys
// (state.circle, state.txs, state.results) are never touched.
// Keys are loaded from the chmod-600 files and never printed.
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('/home/hatch/workspace/nonce-mint/mcp-client/package.json');
const { ethers } = require('ethers');

const RPC = 'http://118.175.0.249:8545';
const STATE_PATH = '/home/hatch/workspace/harbor/deploy/state.json';
const ART = '/home/hatch/workspace/harbor/contracts/out';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn, label, n = 10, base = 1200) {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); } catch (e) { last = e; await sleep(base * (i + 1)); }
  }
  throw new Error(label + ' failed after retries: ' + (last && (last.shortMessage || last.message)));
}

const state = fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) : {};
if (!state.circle2) state.circle2 = { txs: {} };
if (!state.circle2.txs) state.circle2.txs = {};
function save() { fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2)); }
function log(...a) { console.log(new Date().toISOString(), ...a); }

const provider = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: true });
const depKey = JSON.parse(fs.readFileSync('/home/hatch/workspace/harbor/deployer.json', 'utf8'));
const memKeys = JSON.parse(fs.readFileSync('/home/hatch/workspace/harbor/test-members.json', 'utf8'));
const deployer = new ethers.Wallet(depKey.privateKey, provider);
const member1 = new ethers.Wallet(memKeys[0].privateKey, provider);
const member2 = new ethers.Wallet(memKeys[1].privateKey, provider);
const DEP = deployer.address, M1 = member1.address, M2 = member2.address;
log('wallets:', DEP, M1, M2);

function artifact(name) {
  const d = JSON.parse(fs.readFileSync(`${ART}/${name}.sol/${name}.json`, 'utf8'));
  return { abi: d.abi, bytecode: d.bytecode.object };
}

async function waitReceipt(hash, label) {
  for (let i = 0; i < 60; i++) {
    const rc = await retry(() => provider.getTransactionReceipt(hash), 'receipt ' + label, 4).catch(() => null);
    if (rc) {
      if (rc.status !== 1) throw new Error(label + ' tx REVERTED on-chain: ' + hash);
      return rc;
    }
    await sleep(2500);
  }
  throw new Error(label + ' receipt timeout: ' + hash);
}

// Same send() pattern as deploy.mjs: explicit nonce + ambiguity check.
async function send(wallet, txReq, label) {
  const nonceBefore = await retry(() => provider.getTransactionCount(wallet.address, 'pending'), 'nonce ' + label);
  let tx;
  try {
    tx = await wallet.sendTransaction({ ...txReq, nonce: nonceBefore });
  } catch (e) {
    const nonceAfter = await provider.getTransactionCount(wallet.address, 'pending').catch(() => nonceBefore);
    if (nonceAfter <= nonceBefore) throw new Error(label + ' send failed: ' + (e.shortMessage || e.message));
    throw new Error(label + ' send outcome ambiguous (nonce advanced); manual check needed. nonceBefore=' + nonceBefore);
  }
  log(label, 'tx:', tx.hash);
  const rc = await waitReceipt(tx.hash, label);
  log(label, 'confirmed in block', rc.blockNumber, 'gasUsed', rc.gasUsed.toString());
  return { tx, rc };
}

async function call(contract, method, ...args) {
  return retry(() => contract[method](...args), `call ${method}`);
}

const FACTORY = state.factory;
if (!FACTORY) throw new Error('state.factory missing — run deploy.mjs state expected');
const factoryC = new ethers.Contract(FACTORY, artifact('CircleFactory').abi, provider);
log('factory:', FACTORY, 'circleCount before:', (await call(factoryC, 'circleCount')).toString());

// ---------- Step A: createCircle #2 (0.01 MEC, 3 seats, 7-day rounds, native) ----------
const CONTRIB = ethers.parseEther('0.01');
const ROUND_DURATION = 604800n;
let circle2Addr = state.circle2.address;
if (!circle2Addr) {
  const data = factoryC.interface.encodeFunctionData('createCircle', [CONTRIB, 3n, ROUND_DURATION, ethers.ZeroAddress]);
  const { tx, rc } = await send(deployer, { to: FACTORY, data }, 'circle2 createCircle');
  state.circle2.txs.createCircle = tx.hash; save();
  for (const lg of rc.logs) {
    try {
      const parsed = factoryC.interface.parseLog(lg);
      if (parsed && parsed.name === 'CircleCreated') circle2Addr = parsed.args.circle;
    } catch {}
  }
  if (!circle2Addr) {
    const cnt = await call(factoryC, 'circleCount');
    circle2Addr = await call(factoryC, 'circles', cnt - 1n);
    log('circle2 address via fallback circles(circleCount-1):', circle2Addr);
  }
  state.circle2.address = circle2Addr; save();
  log('circle #2 created at', circle2Addr);
} else {
  log('circle #2 already in state:', circle2Addr);
}
const circle = new ethers.Contract(circle2Addr, artifact('SavingsCircle').abi, provider);
{
  const [cc, mm, rd, tk] = await Promise.all([
    call(circle, 'contributionAmount'), call(circle, 'maxMembers'),
    call(circle, 'roundDuration'), call(circle, 'token'),
  ]);
  log('circle2 config: contribution', ethers.formatEther(cc), 'maxMembers', mm.toString(),
      'roundDuration', rd.toString(), 'token', tk);
  if (cc !== CONTRIB || mm !== 3n || rd !== ROUND_DURATION || tk !== ethers.ZeroAddress)
    throw new Error('circle2 config mismatch');
}

// ---------- Step B: joins in order member1, member2, deployer ----------
const joinOrder = [[member1, 'joinMember1'], [member2, 'joinMember2'], [deployer, 'joinDeployer']];
for (const [w, key] of joinOrder) {
  const isM = await call(circle, 'isMember', w.address);
  if (isM) { log(key, 'already member, skipping'); continue; }
  const data = circle.interface.encodeFunctionData('join');
  const { tx } = await send(w, { to: circle2Addr, data }, 'circle2 ' + key);
  state.circle2.txs[key] = tx.hash; save();
}
{
  const members = await call(circle, 'getMembers');
  log('circle2 members on-chain:', members.join(', '));
  if (members.length !== 3 ||
      members[0].toLowerCase() !== M1.toLowerCase() ||
      members[1].toLowerCase() !== M2.toLowerCase() ||
      members[2].toLowerCase() !== DEP.toLowerCase())
    throw new Error('circle2 member order mismatch');
  const phase = await call(circle, 'phase');
  const round = await call(circle, 'currentRound');
  log('circle2 phase', phase.toString(), '(1=Active)', 'currentRound', round.toString());
  if (BigInt(phase) !== 1n || BigInt(round) !== 1n) throw new Error('circle2 not Active at round 1 after joins');
}

// ---------- Step C: round-1 deposits, 0.01 MEC each ----------
const depOrder = [[member1, 'depositMember1'], [member2, 'depositMember2'], [deployer, 'depositDeployer']];
for (const [w, key] of depOrder) {
  const has = await call(circle, 'hasDeposited', 1n, w.address);
  if (has) { log(key, 'already deposited round 1, skipping'); continue; }
  const data = circle.interface.encodeFunctionData('deposit');
  const { tx } = await send(w, { to: circle2Addr, data, value: CONTRIB }, 'circle2 ' + key);
  state.circle2.txs[key] = tx.hash; save();
}
// STOP HERE — advanceRound is intentionally NOT called.

// ---------- Step D: independent verification (fresh provider + contracts) ----------
log('--- independent verification (fresh provider) ---');
const p2 = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: true });
const factory2 = new ethers.Contract(FACTORY, artifact('CircleFactory').abi, p2);
const circleV = new ethers.Contract(circle2Addr, artifact('SavingsCircle').abi, p2);
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail: String(detail) });
  log((ok ? 'PASS' : 'FAIL'), '-', name, ':', detail);
}
const vPhase = await retry(() => circleV.phase(), 'v phase');
check('phase == 1 (Active)', BigInt(vPhase) === 1n, 'phase=' + vPhase.toString());
const vCount = await retry(() => circleV.memberCount(), 'v memberCount');
check('memberCount == 3', BigInt(vCount) === 3n, 'memberCount=' + vCount.toString());
const vMembers = await retry(() => circleV.getMembers(), 'v getMembers');
const orderOk = vMembers.length === 3 &&
  vMembers[0].toLowerCase() === M1.toLowerCase() &&
  vMembers[1].toLowerCase() === M2.toLowerCase() &&
  vMembers[2].toLowerCase() === DEP.toLowerCase();
check('member order == [member1, member2, deployer]', orderOk, vMembers.join(', '));
const vRound = await retry(() => circleV.currentRound(), 'v currentRound');
check('currentRound == 1', BigInt(vRound) === 1n, 'currentRound=' + vRound.toString());
const vDeps = await retry(() => circleV.depositsThisRound(), 'v depositsThisRound');
check('depositsThisRound == 3', BigInt(vDeps) === 3n, 'depositsThisRound=' + vDeps.toString());
const vCollected = await retry(() => circleV.collectedThisRound(), 'v collectedThisRound');
check('collectedThisRound == 0.03 MEC', vCollected === CONTRIB * 3n, ethers.formatEther(vCollected) + ' MEC');
const vBal = await retry(() => p2.getBalance(circle2Addr), 'v circle balance');
check('circle contract balance == 0.03 MEC', vBal === CONTRIB * 3n, ethers.formatEther(vBal) + ' MEC');
const vDeadline = await retry(() => circleV.roundDeadline(), 'v roundDeadline');
const nowSec = BigInt(Math.floor(Date.now() / 1000));
const drift = vDeadline > nowSec ? vDeadline - nowSec : nowSec - vDeadline;
check('roundDeadline ~ activation + 604800 (remaining within 604800 ± 3600)',
  vDeadline > nowSec && drift <= ROUND_DURATION && (ROUND_DURATION - drift) <= 3600n,
  'roundDeadline=' + vDeadline.toString() + ' (' + new Date(Number(vDeadline) * 1000).toISOString() + '), remaining=' + drift.toString() + 's');
const vFactoryCount = await retry(() => factory2.circleCount(), 'v circleCount');
check('factory.circleCount() == 2', BigInt(vFactoryCount) === 2n, 'circleCount=' + vFactoryCount.toString());
for (const [addr, label] of [[M1, 'member1'], [M2, 'member2'], [DEP, 'deployer']]) {
  const has = await retry(() => circleV.hasDeposited(1n, addr), 'v hasDeposited ' + label);
  check(`hasDeposited(1, ${label}) == true`, has === true, String(has));
}
const balances = {};
for (const [addr, label] of [[DEP, 'deployer'], [M1, 'member1'], [M2, 'member2']]) {
  const b = await retry(() => p2.getBalance(addr), 'v bal ' + label);
  balances[label] = ethers.formatEther(b);
  log('final balance', label, addr, balances[label], 'MEC');
}
state.circle2.verification = { checks, balances, roundDeadline: vDeadline.toString(), verifiedAt: new Date().toISOString() };
save();
const failed = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ circle2: circle2Addr, txs: state.circle2.txs, checks, balances }, null, 2));
if (failed.length) throw new Error('verification FAILED: ' + failed.map((c) => c.name).join('; '));
log('CIRCLE2 DONE — Active, round 1, pot 0.03 MEC, advanceRound NOT called');
