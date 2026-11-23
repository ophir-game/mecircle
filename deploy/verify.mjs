// Independent final verification of the MECircle e2e run, straight from chain state.
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('/home/hatch/workspace/nonce-mint/mcp-client/package.json');
const { ethers } = require('ethers');

const RPC = 'http://118.175.0.249:8545';
const ART = '/home/hatch/workspace/harbor/contracts/out';
const state = JSON.parse(fs.readFileSync('/home/hatch/workspace/harbor/deploy/state.json', 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn, label, n = 10) {
  let last;
  for (let i = 0; i < n; i++) { try { return await fn(); } catch (e) { last = e; await sleep(1200 * (i + 1)); } }
  throw new Error(label + ': ' + (last && last.message));
}
const provider = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: true });
function artifact(name) { return JSON.parse(fs.readFileSync(`${ART}/${name}.sol/${name}.json`, 'utf8')); }

const registry = new ethers.Contract(state.registry, artifact('AttestationRegistry').abi, provider);
const factory = new ethers.Contract(state.factory, artifact('CircleFactory').abi, provider);
const ledger = new ethers.Contract(state.ledger, artifact('ReputationLedger').abi, provider);
const circle = new ethers.Contract(state.circle, artifact('SavingsCircle').abi, provider);

const DEP = '0xb9Cd22aD6DC474c7135faE4d88F5E97138a78250';
const M1 = '0x2BfeEbFd9Bb69e4EFd3783CC0609A4b66A7cCD54';
const M2 = '0xDBa88Fa8c5ef558121998Bc11B880B62D0e51b82';
const out = { checks: [] };
const check = (name, ok, detail) => { out.checks.push({ name, ok, detail }); console.log((ok ? 'PASS' : 'FAIL'), name, '-', detail); };

// --- round-3 pot accounting from the advance receipt itself ---
const rc = await retry(() => provider.getTransactionReceipt(state.txs.r3advanceRound), 'r3 receipt');
let potEvent = null, paidEvent = null;
for (const lg of rc.logs) {
  try {
    const p = circle.interface.parseLog(lg);
    if (p && p.name === 'RoundAdvanced') potEvent = { round: p.args.round.toString(), recipient: p.args.recipient, pot: p.args.pot, defaults: p.args.defaultsThisRound.toString() };
    if (p && p.name === 'PotPaid') paidEvent = { recipient: p.args.recipient, round: p.args.round.toString(), amount: p.args.amount };
  } catch {}
}
const gasCost = rc.gasUsed * rc.gasPrice;
out.r3 = { potFromEvent: potEvent && ethers.formatEther(potEvent.pot), gasUsed: rc.gasUsed.toString(), effectiveGasPriceWei: rc.gasPrice.toString(), gasCostMEC: ethers.formatEther(gasCost) };
check('r3 RoundAdvanced pot == 0.03 MEC', !!potEvent && potEvent.pot === ethers.parseEther('0.03'), potEvent ? ethers.formatEther(potEvent.pot) : 'event missing');
check('r3 PotPaid == 0.03 MEC to deployer', !!paidEvent && paidEvent.amount === ethers.parseEther('0.03') && paidEvent.recipient.toLowerCase() === DEP.toLowerCase(), paidEvent ? `${ethers.formatEther(paidEvent.amount)} -> ${paidEvent.recipient}` : 'event missing');
check('r3 observed delta + gas == pot (0.0299999 + gas)', ethers.parseEther('0.03') - 29999990000000000n === gasCost, 'shortfall ' + (ethers.parseEther('0.03') - 29999990000000000n).toString() + ' wei vs gas cost ' + gasCost.toString() + ' wei');

// --- final contract state ---
const phase = await retry(() => circle.phase(), 'phase');
check('circle phase == Completed (2)', phase === 2n, 'phase=' + phase.toString());
const circBal = await retry(() => provider.getBalance(state.circle), 'circle bal');
check('circle balance == 0', circBal === 0n, ethers.formatEther(circBal));
const cc = await retry(() => factory.circleCount(), 'circleCount');
check('factory circleCount == 1', cc === 1n, cc.toString());
for (const [addr, label] of [[DEP, 'deployer'], [M1, 'member1'], [M2, 'member2']]) {
  const v = await retry(() => registry.isVerified(addr), 'isVerified');
  const rep = await retry(() => ledger.reputationOf(addr), 'reputationOf');
  const pend = await retry(() => circle.pendingWithdrawals(addr), 'pending');
  const bal = await retry(() => provider.getBalance(addr), 'balance');
  check(`${label} isVerified`, v === true, String(v));
  check(`${label} reputation == 3 on-time / 0 defaulted / 1 completed`, rep[0] === 3n && rep[1] === 0n && rep[2] === 1n, `${rep[0]}/${rep[1]}/${rep[2]}`);
  check(`${label} pendingWithdrawals == 0`, pend === 0n, pend.toString());
  out[label] = { address: addr, balanceMEC: ethers.formatEther(bal), isVerified: v, roundsOnTime: rep[0].toString(), roundsDefaulted: rep[1].toString(), circlesCompleted: rep[2].toString() };
}
out.allPassed = out.checks.every((c) => c.ok);
state.results = out; state.r3Note = 'deploy.mjs halted at its strict round-3 delta check because the round-3 recipient (deployer) also paid the advanceRound gas; verify.mjs reconciles the delta exactly from the receipt (pot event 0.03 MEC, shortfall == gas cost).';
fs.writeFileSync('/home/hatch/workspace/harbor/deploy/state.json', JSON.stringify(state, null, 2));
console.log(JSON.stringify(out, null, 2));
if (!out.allPassed) process.exit(1);
