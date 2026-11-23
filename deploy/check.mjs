import { createRequire } from 'module';
const require = createRequire('/home/hatch/workspace/nonce-mint/mcp-client/package.json');
const { ethers } = require('ethers');
console.log('ethers version:', ethers.version);
const RPC = 'http://118.175.0.249:8545';
async function retry(fn, label, n=8) {
  let last;
  for (let i=0;i<n;i++) {
    try { return await fn(); } catch(e) { last=e; await new Promise(r=>setTimeout(r, 1500*(i+1))); }
  }
  throw new Error(label+' failed: '+(last && last.message));
}
const provider = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: true });
const net = await retry(()=>provider.getNetwork(), 'network');
console.log('chainId:', net.chainId.toString());
const gp = await retry(()=>provider.getFeeData(), 'feeData');
console.log('gasPrice (wei):', gp.gasPrice?.toString());
const dep = '0xb9Cd22aD6DC474c7135faE4d88F5E97138a78250';
for (const a of [dep,'0x2BfeEbFd9Bb69e4EFd3783CC0609A4b66A7cCD54','0xDBa88Fa8c5ef558121998Bc11B880B62D0e51b82']) {
  const b = await retry(()=>provider.getBalance(a), 'bal '+a);
  console.log(a, 'balance MEC:', ethers.formatEther(b));
}
const blk = await retry(()=>provider.getBlockNumber(), 'block');
console.log('block:', blk);
