// MECircle testnet deployment + e2e. Resumable via state.json.
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

const state = fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) : { txs: {} };
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

// Send a tx; if the send call itself errors ambiguously, check whether the
// sender nonce advanced (tx landed) before deciding it failed.
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

// ---------- Step 1: deploy AttestationRegistry ----------
let registry;
if (state.registry) {
  registry = new ethers.Contract(state.registry, artifact('AttestationRegistry').abi, provider);
  log('registry already deployed at', state.registry);
} else {
  const a = artifact('AttestationRegistry');
  const factory = new ethers.ContractFactory(a.abi, a.bytecode, deployer);
  const nonce = await retry(() => provider.getTransactionCount(DEP, 'pending'), 'nonce deploy registry');
  const c = await factory.deploy({ nonce });
  log('registry deploy tx:', c.deploymentTransaction().hash);
  await waitReceipt(c.deploymentTransaction().hash, 'deploy registry');
  state.registry = await c.getAddress();
  state.txs.deployRegistry = c.deploymentTransaction().hash;
  save();
  registry = new ethers.Contract(state.registry, a.abi, provider);
  log('registry deployed at', state.registry);
}
const regOwner = await call(registry, 'owner');
if (regOwner.toLowerCase() !== DEP.toLowerCase()) throw new Error('registry owner mismatch: ' + regOwner);
log('registry owner verified = deployer');

// ---------- Step 2: deploy CircleFactory ----------
let factoryC;
if (state.factory) {
  factoryC = new ethers.Contract(state.factory, artifact('CircleFactory').abi, provider);
  log('factory already deployed at', state.factory);
} else {
  const a = artifact('CircleFactory');
  const cf = new ethers.ContractFactory(a.abi, a.bytecode, deployer);
  const nonce = await retry(() => provider.getTransactionCount(DEP, 'pending'), 'nonce deploy factory');
  const c = await cf.deploy(state.registry, { nonce });
  log('factory deploy tx:', c.deploymentTransaction().hash);
  await waitReceipt(c.deploymentTransaction().hash, 'deploy factory');
  state.factory = await c.getAddress();
  state.txs.deployFactory = c.deploymentTransaction().hash;
  save();
  factoryC = new ethers.Contract(state.factory, a.abi, provider);
  log('factory deployed at', state.factory);
}
const ledgerAddr = await call(factoryC, 'ledger');
state.ledger = ledgerAddr; save();
const ledger = new ethers.Contract(ledgerAddr, artifact('ReputationLedger').abi, provider);
const ledgerAdmin = await call(ledger, 'admin');
if (ledgerAdmin.toLowerCase() !== state.factory.toLowerCase()) throw new Error('ledger admin mismatch: ' + ledgerAdmin);
const factoryRegistry = await call(factoryC, 'registry');
if (factoryRegistry.toLowerCase() !== state.registry.toLowerCase()) throw new Error('factory registry mismatch');
log('factory verified; ledger at', ledgerAddr, 'admin = factory');

// ---------- Step 3: fund members 0.05 MEC each ----------
const FUND = ethers.parseEther('0.05');
for (const [w, label] of [[member1, 'fund member1'], [member2, 'fund member2']]) {
  const bal = await retry(() => provider.getBalance(w.address), 'bal ' + label);
  if (bal >= FUND) { log(label, 'already funded:', ethers.formatEther(bal)); continue; }
  const gp = (await retry(() => provider.getFeeData(), 'feeData')).gasPrice ?? 7n;
  const { tx } = await send(deployer, { to: w.address, value: FUND, gasPrice: gp, gasLimit: 21000n }, label);
  state.txs[label.replace(' ', '')] = tx.hash; save();
  const bal2 = await retry(() => provider.getBalance(w.address), 'bal2 ' + label);
  log(label, 'balance now', ethers.formatEther(bal2));
  if (bal2 < FUND) throw new Error(label + ' balance insufficient after funding');
}

// ---------- Step 4: attest all three ----------
const regW = registry.connect(deployer);
for (const [addr, label] of [[DEP, 'attest deployer'], [M1, 'attest member1'], [M2, 'attest member2']]) {
  const already = await call(registry, 'isVerified', addr);
  if (already) { log(label, 'already verified'); continue; }
  const data = registry.interface.encodeFunctionData('attest', [addr]);
  const { tx } = await send(deployer, { to: state.registry, data }, label);
  state.txs[label.replace(' ', '')] = tx.hash; save();
  const v = await call(registry, 'isVerified', addr);
  if (!v) throw new Error(label + ': isVerified still false after attest');
  log(label, 'verified on-chain');
}

// ---------- Step 5: createCircle ----------
const CONTRIB = ethers.parseEther('0.01');
let circleAddr = state.circle;
if (!circleAddr) {
  const data = factoryC.interface.encodeFunctionData('createCircle', [CONTRIB, 3n, 3600n, ethers.ZeroAddress]);
  const { tx, rc } = await send(deployer, { to: state.factory, data }, 'createCircle');
  state.txs.createCircle = tx.hash;
  // parse CircleCreated event
  for (const lg of rc.logs) {
    try {
      const parsed = factoryC.interface.parseLog(lg);
      if (parsed && parsed.name === 'CircleCreated') circleAddr = parsed.args.circle;
    } catch {}
  }
  if (!circleAddr) circleAddr = await call(factoryC, 'circles', 0);
  state.circle = circleAddr; save();
  log('circle created at', circleAddr);
}
const circle = new ethers.Contract(circleAddr, artifact('SavingsCircle').abi, provider);
{
  const [cc, mm, rd, tk, cnt] = await Promise.all([
    call(circle, 'contributionAmount'), call(circle, 'maxMembers'),
    call(circle, 'roundDuration'), call(circle, 'token'), call(circle, 'memberCount'),
  ]);
  log('circle config: contribution', ethers.formatEther(cc), 'maxMembers', mm.toString(),
      'roundDuration', rd.toString(), 'token', tk, 'members', cnt.toString());
  if (cc !== CONTRIB || mm !== 3n || tk !== ethers.ZeroAddress) throw new Error('circle config mismatch');
}

// ---------- Step 6: joins (member1 first => round-1 recipient) ----------
const joinOrder = [[member1, 'join member1'], [member2, 'join member2'], [deployer, 'join deployer']];
for (const [w, label] of joinOrder) {
  const isM = await call(circle, 'isMember', w.address);
  if (isM) { log(label, 'already member'); continue; }
  const data = circle.interface.encodeFunctionData('join');
  const { tx } = await send(w, { to: circleAddr, data }, label);
  state.txs[label.replace(' ', '')] = tx.hash; save();
}
{
  const members = await call(circle, 'getMembers');
  log('members on-chain:', members.join(', '));
  if (members[0].toLowerCase() !== M1.toLowerCase() || members[1].toLowerCase() !== M2.toLowerCase() || members[2].toLowerCase() !== DEP.toLowerCase())
    throw new Error('member order mismatch');
  const phase = await call(circle, 'phase');
  const round = await call(circle, 'currentRound');
  log('phase', phase.toString(), '(1=Active)', 'currentRound', round.toString());
  if (phase !== 1n || round !== 1n) throw new Error('circle not Active at round 1');
}

// ---------- Step 7: three rounds ----------
const wallets = { [DEP.toLowerCase()]: deployer, [M1.toLowerCase()]: member1, [M2.toLowerCase()]: member2 };
for (let round = 1; round <= 3; round++) {
  const members = await call(circle, 'getMembers');
  const recipient = members[round - 1];
  const curRound = await call(circle, 'currentRound');
  if (curRound !== BigInt(round)) throw new Error(`round mismatch: on-chain ${curRound} expected ${round}`);
  // deposits
  for (const [w, label] of [[member1, `r${round} deposit member1`], [member2, `r${round} deposit member2`], [deployer, `r${round} deposit deployer`]]) {
    const has = await call(circle, 'hasDeposited', BigInt(round), w.address);
    if (has) { log(label, 'already deposited'); continue; }
    const data = circle.interface.encodeFunctionData('deposit');
    const { tx } = await send(w, { to: circleAddr, data, value: CONTRIB }, label);
    state.txs[label.replaceAll(' ', '')] = tx.hash; save();
  }
  const depCount = await call(circle, 'depositsThisRound');
  const circBal = await retry(() => provider.getBalance(circleAddr), 'circle balance');
  log(`round ${round}: depositsThisRound`, depCount.toString(), 'circle balance', ethers.formatEther(circBal));
  if (depCount !== 3n || circBal !== CONTRIB * 3n) throw new Error(`round ${round} deposit state wrong`);
  // advance
  const recipBalBefore = await retry(() => provider.getBalance(recipient), 'recipient bal before');
  const advLabel = `r${round} advanceRound`;
  const data = circle.interface.encodeFunctionData('advanceRound');
  const { tx } = await send(deployer, { to: circleAddr, data }, advLabel);
  state.txs[advLabel.replaceAll(' ', '')] = tx.hash; save();
  const recipBalAfter = await retry(() => provider.getBalance(recipient), 'recipient bal after');
  const delta = recipBalAfter - recipBalBefore;
  log(`round ${round}: recipient ${recipient} pot delta`, ethers.formatEther(delta), 'MEC');
  if (delta !== CONTRIB * 3n) throw new Error(`round ${round} pot delta wrong: ${delta}`);
  const circBal2 = await retry(() => provider.getBalance(circleAddr), 'circle balance after');
  if (circBal2 !== 0n) throw new Error(`round ${round}: circle balance not zero after payout`);
}

// ---------- Step 8: final verification ----------
const phase = await call(circle, 'phase');
log('final phase', phase.toString(), '(2=Completed)');
if (phase !== 2n) throw new Error('circle not Completed');
const results = { registry: state.registry, factory: state.factory, ledger: state.ledger, circle: state.circle, members: {}, balances: {} };
for (const [addr, label] of [[DEP, 'deployer'], [M1, 'member1'], [M2, 'member2']]) {
  const v = await call(registry, 'isVerified', addr);
  const rep = await call(ledger, 'reputationOf', addr);
  const bal = await retry(() => provider.getBalance(addr), 'final bal');
  results.members[label] = {
    address: addr, isVerified: v,
    roundsOnTime: rep[0].toString(), roundsDefaulted: rep[1].toString(), circlesCompleted: rep[2].toString(),
  };
  results.balances[label] = ethers.formatEther(bal);
  log(label, addr, 'isVerified', v, 'rep onTime/defaulted/completed',
      rep[0].toString(), rep[1].toString(), rep[2].toString(), 'balance', ethers.formatEther(bal), 'MEC');
  if (!v || rep[0] !== 3n || rep[1] !== 0n || rep[2] !== 1n) throw new Error('final reputation mismatch for ' + label);
}
state.results = results; save();
log('ALL DONE');
console.log(JSON.stringify(results, null, 2));
