/* MECircle live demo — reads ME Network testnet (chain 400) via same-origin /rpc proxy.
   Render-first pattern: paint cached/skeleton state immediately, probe chain in background. */
(function () {
  "use strict";

  var ADDR = {
    registry: "0x00Bb9923F4f9a5f163A2735698aa309B7cD7d841",
    factory: "0x7d75DEAde0403e5149fE20724EA7EBeE1092D446",
    ledger: "0x7E60fc18A89fEE1f3e59D1db2C2d8D0B41bc7204",
    circle1: "0xDD8F1B8d8Ccaf4C253171768d5077b0E202A6E10"
  };
  var CHAIN_ID = 400;
  var CHAIN_HEX = "0x190";
  // ethers v6 rejects relative URLs ("unsupported protocol") — make it absolute.
  var RPC_URL = (window.location && window.location.origin && window.location.origin !== "null")
    ? window.location.origin + "/rpc" : "/rpc";
  var PHASES = ["Forming", "Active", "Completed"];
  var CACHE_KEY = "mecircle-cache-v1";

  var REGISTRY_ABI = [
    "function isVerified(address account) view returns (bool)",
    "function owner() view returns (address)"
  ];
  var FACTORY_ABI = [
    "function circleCount() view returns (uint256)",
    "function circles(uint256) view returns (address)",
    "function createCircle(uint256 contributionAmount, uint256 maxMembers, uint256 roundDuration, address token) returns (address)",
    "function registry() view returns (address)",
    "function ledger() view returns (address)"
  ];
  var LEDGER_ABI = [
    "function reputationOf(address account) view returns (uint256 roundsOnTime, uint256 roundsDefaulted, uint256 circlesCompleted)"
  ];
  var CIRCLE_ABI = [
    "function phase() view returns (uint8)",
    "function getMembers() view returns (address[])",
    "function memberCount() view returns (uint256)",
    "function contributionAmount() view returns (uint256)",
    "function maxMembers() view returns (uint256)",
    "function roundDuration() view returns (uint256)",
    "function currentRound() view returns (uint256)",
    "function roundDeadline() view returns (uint256)",
    "function depositsThisRound() view returns (uint256)",
    "function collectedThisRound() view returns (uint256)",
    "function hasDeposited(uint256 round, address account) view returns (bool)",
    "function pendingWithdrawals(address account) view returns (uint256)",
    "function token() view returns (address)",
    "function creator() view returns (address)",
    "function isMember(address account) view returns (bool)",
    "function join()",
    "function deposit() payable",
    "function advanceRound()",
    "function withdraw()",
    "function leave()"
  ];

  var $ = function (id) { return document.getElementById(id); };
  var state = {
    account: null,
    circles: [],       // [{address, phase, members[], contribution, maxMembers, roundDuration, currentRound, roundDeadline, deposits, collected, pending}]
    circleCount: null,
    loading: false
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function short(a) { return a ? a.slice(0, 6) + "…" + a.slice(-4) : ""; }
  function fmtMEC(wei) {
    try { return trimNum(ethers.formatEther(wei)) + " MEC"; } catch (e) { return String(wei); }
  }
  function trimNum(s) {
    if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
    return s;
  }
  function fmtDuration(sec) {
    sec = Number(sec);
    if (sec % 86400 === 0) return (sec / 86400) + " day" + (sec === 86400 ? "" : "s");
    if (sec % 3600 === 0) return (sec / 3600) + " h";
    return sec + " s";
  }
  function fmtCountdown(deadlineSec) {
    var diff = Number(deadlineSec) - Math.floor(Date.now() / 1000);
    if (diff <= 0) return "deadline passed — round can be advanced";
    var d = Math.floor(diff / 86400), h = Math.floor((diff % 86400) / 3600), m = Math.floor((diff % 3600) / 60);
    if (d > 0) return "ends in " + d + "d " + h + "h";
    if (h > 0) return "ends in " + h + "h " + m + "m";
    return "ends in " + m + "m";
  }
  function fmtDate(sec) {
    try { return new Date(Number(sec) * 1000).toUTCString(); } catch (e) { return ""; }
  }

  /* ---------- providers ---------- */
  function readProvider() {
    // staticNetwork avoids an extra network-detection round trip per load.
    var net = new ethers.Network("ME Network Testnet", CHAIN_ID);
    return new ethers.JsonRpcProvider(RPC_URL, net, { staticNetwork: net });
  }
  function contracts(providerOrSigner) {
    return {
      registry: new ethers.Contract(ADDR.registry, REGISTRY_ABI, providerOrSigner),
      factory: new ethers.Contract(ADDR.factory, FACTORY_ABI, providerOrSigner),
      ledger: new ethers.Contract(ADDR.ledger, LEDGER_ABI, providerOrSigner)
    };
  }
  function circleContract(address, providerOrSigner) {
    return new ethers.Contract(address, CIRCLE_ABI, providerOrSigner);
  }

  /* ---------- cache ---------- */
  function saveCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        circleCount: state.circleCount,
        circles: state.circles.map(function (c) {
          return {
            address: c.address, phase: c.phase, members: c.members,
            contribution: String(c.contribution), maxMembers: Number(c.maxMembers),
            roundDuration: Number(c.roundDuration), currentRound: Number(c.currentRound),
            roundDeadline: Number(c.roundDeadline), deposits: Number(c.deposits),
            collected: String(c.collected), pending: c.pending != null ? String(c.pending) : null
          };
        }),
        ts: Date.now()
      }));
    } catch (e) { /* storage unavailable — fine */ }
  }
  function loadCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return false;
      var d = JSON.parse(raw);
      state.circleCount = d.circleCount;
      state.circles = (d.circles || []).map(function (c) {
        return {
          address: c.address, phase: c.phase, members: c.members || [],
          contribution: BigInt(c.contribution), maxMembers: BigInt(c.maxMembers),
          roundDuration: BigInt(c.roundDuration), currentRound: BigInt(c.currentRound),
          roundDeadline: BigInt(c.roundDeadline), deposits: BigInt(c.deposits),
          collected: BigInt(c.collected), pending: c.pending != null ? BigInt(c.pending) : null
        };
      });
      return state.circles.length > 0 || state.circleCount != null;
    } catch (e) { return false; }
  }

  /* ---------- rendering ---------- */
  function renderContracts() {
    $("contractList").innerHTML =
      li("AttestationRegistry", ADDR.registry) +
      li("CircleFactory", ADDR.factory) +
      li("ReputationLedger", ADDR.ledger) +
      li("SavingsCircle #1", ADDR.circle1);
    function li(name, a) {
      return '<li><span>' + esc(name) + '</span><span class="addr">' + esc(a) + "</span></li>";
    }
  }

  function render() {
    $("statCircles").textContent = state.circleCount == null ? "–" : String(state.circleCount);
    $("statFactory").textContent = short(ADDR.factory);
    $("statFactorySub").textContent = "CircleFactory · " + ADDR.factory;
    $("statRegistry").textContent = short(ADDR.registry);

    var box = $("circles");
    if (!state.circles.length) {
      box.innerHTML = '<p class="muted">No circles loaded yet — probing the factory in the background…</p>';
      return;
    }
    box.innerHTML = state.circles.map(renderCircle).join("");
    bindCircleButtons();
  }

  function renderCircle(c, idx) {
    var phaseName = PHASES[Number(c.phase)] || ("Phase " + c.phase);
    var members = c.members || [];
    var recipient = "";
    if (Number(c.phase) === 1 && Number(c.currentRound) >= 1 && members.length >= Number(c.currentRound)) {
      recipient = members[Number(c.currentRound) - 1];
    }
    var deadlineHtml = "";
    if (Number(c.phase) === 1 && Number(c.roundDeadline) > 0) {
      deadlineHtml = "<div><span>Round deadline</span>" + esc(fmtCountdown(c.roundDeadline)) +
        ' <span class="muted">(' + esc(fmtDate(c.roundDeadline)) + ")</span></div>";
    }
    var memberLis = members.map(function (m, i) {
      var tag = recipient && m.toLowerCase() === recipient.toLowerCase() ? ' <span class="pill pill-yes">pot recipient this round</span>' : "";
      return '<li><span class="addr">' + esc(m) + "</span>" + tag + "</li>";
    }).join("");
    var pendingHtml = "";
    if (state.account && c.pending != null) {
      pendingHtml = "<div><span>Your pending withdrawal</span>" + esc(fmtMEC(c.pending)) + "</div>";
    }
    var actions = "";
    if (state.account) {
      if (Number(c.phase) === 0) actions += '<button class="btn btn-sm btn-primary" data-act="join" data-addr="' + esc(c.address) + '">Join circle</button>';
      if (Number(c.phase) === 1) {
        actions += '<button class="btn btn-sm btn-primary" data-act="deposit" data-addr="' + esc(c.address) + '">Deposit ' + esc(fmtMEC(c.contribution)) + "</button>";
        actions += '<button class="btn btn-sm" data-act="advance" data-addr="' + esc(c.address) + '">Advance round</button>';
      }
      if (c.pending != null && c.pending > 0n) actions += '<button class="btn btn-sm btn-primary" data-act="withdraw" data-addr="' + esc(c.address) + '">Withdraw ' + esc(fmtMEC(c.pending)) + "</button>";
      else actions += '<button class="btn btn-sm" data-act="withdraw" data-addr="' + esc(c.address) + '">Withdraw</button>';
    }
    return '<article class="circle">' +
      '<div class="circle-head"><span class="circle-title">Circle #' + (idx + 1) + ' <span class="addr muted">' + esc(c.address) + '</span></span>' +
      '<span class="phase phase-' + Number(c.phase) + '">' + esc(phaseName) + "</span></div>" +
      '<div class="kv">' +
      "<div><span>Members</span>" + members.length + " / " + Number(c.maxMembers) + "</div>" +
      "<div><span>Contribution / round</span>" + esc(fmtMEC(c.contribution)) + "</div>" +
      "<div><span>Round length</span>" + esc(fmtDuration(c.roundDuration)) + "</div>" +
      "<div><span>Current round</span>" + Number(c.currentRound) + "</div>" +
      "<div><span>Deposits this round</span>" + Number(c.deposits) + " / " + members.length + "</div>" +
      "<div><span>Pot collected this round</span>" + esc(fmtMEC(c.collected)) + "</div>" +
      deadlineHtml + pendingHtml +
      "</div>" +
      (members.length ? '<div class="members"><span class="muted">Members, in payout order:</span><ol>' + memberLis + "</ol></div>" : "") +
      (actions ? '<div class="actions">' + actions + "</div>" : "") +
      "</article>";
  }

  function bindCircleButtons() {
    var btns = document.querySelectorAll("[data-act]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener("click", function () {
        onCircleAction(this.getAttribute("data-act"), this.getAttribute("data-addr"));
      });
    }
  }

  /* ---------- chain probing (background) ---------- */
  function setLive(txt, warn) {
    var el = $("liveStatus");
    el.textContent = txt;
    el.className = "badge " + (warn ? "badge-warn" : "badge-live");
  }

  async function loadCircle(address, provider, account) {
    var c = circleContract(address, provider);
    var base = await Promise.all([
      c.phase(), c.getMembers(), c.contributionAmount(), c.maxMembers(),
      c.roundDuration(), c.currentRound(), c.roundDeadline(),
      c.depositsThisRound(), c.collectedThisRound()
    ]);
    var pending = null;
    if (account) {
      try { pending = await c.pendingWithdrawals(account); } catch (e) { pending = null; }
    }
    return {
      address: address, phase: base[0], members: base[1], contribution: base[2],
      maxMembers: base[3], roundDuration: base[4], currentRound: base[5],
      roundDeadline: base[6], deposits: base[7], collected: base[8], pending: pending
    };
  }

  async function refresh() {
    if (state.loading) return;
    state.loading = true;
    setLive("syncing…", true);
    try {
      var provider = readProvider();
      var cs = contracts(provider);
      var count = Number(await cs.factory.circleCount());
      var addrs = [];
      for (var i = 0; i < count; i++) addrs.push(await cs.factory.circles(i));
      var circles = [];
      for (var j = 0; j < addrs.length; j++) {
        circles.push(await loadCircle(addrs[j], provider, state.account));
      }
      state.circleCount = count;
      state.circles = circles;
      saveCache();
      render();
      setLive("live · updated " + new Date().toLocaleTimeString(), false);
    } catch (e) {
      setLive("RPC slow/unreachable — showing last known data", true);
    } finally {
      state.loading = false;
    }
  }

  /* ---------- address check ---------- */
  async function checkAddress() {
    var v = $("checkAddr").value.trim();
    var out = $("checkResult");
    if (!ethers.isAddress(v)) { out.innerHTML = '<span class="pill pill-no">Invalid address</span>'; return; }
    out.innerHTML = '<span class="muted">Reading registry &amp; ledger…</span>';
    try {
      var cs = contracts(readProvider());
      var res = await Promise.all([cs.registry.isVerified(v), cs.ledger.reputationOf(v)]);
      var verified = res[0], rep = res[1];
      out.innerHTML =
        '<p><span class="pill ' + (verified ? "pill-yes" : "pill-no") + '">' +
        (verified ? "Identity verified" : "Not verified") + "</span>" +
        '<span class="addr">' + esc(v) + "</span></p>" +
        '<div class="kv">' +
        "<div><span>Rounds on time</span>" + Number(rep[0]) + "</div>" +
        "<div><span>Rounds defaulted</span>" + Number(rep[1]) + "</div>" +
        "<div><span>Circles completed</span>" + Number(rep[2]) + "</div>" +
        "</div>";
    } catch (e) {
      out.innerHTML = '<span class="pill pill-no">Lookup failed — RPC unreachable, try again.</span>';
    }
  }

  /* ---------- wallet ---------- */
  function setTx(msg, kind) {
    var el = $("txStatus");
    if (!msg) { el.className = "tx-status hidden"; el.innerHTML = ""; return; }
    el.className = "tx-status" + (kind ? " " + kind : "");
    el.innerHTML = msg;
  }

  function walletNote() {
    var el = $("walletNote");
    if (!window.ethereum) {
      el.textContent = "Read-only mode: no browser wallet detected — connect a wallet to create circles, join, and deposit.";
    } else if (state.account) {
      el.textContent = "Connected: " + state.account;
    } else {
      el.textContent = "";
    }
    $("connectBtn").textContent = state.account ? short(state.account) : "Connect Wallet";
  }

  async function ensureChain() {
    var current = await window.ethereum.request({ method: "eth_chainId" });
    if (current && current.toLowerCase() === CHAIN_HEX) return;
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
    } catch (e) {
      if (e && (e.code === 4902 || /unrecognized|not added/i.test(e.message || ""))) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: CHAIN_HEX,
            chainName: "ME Network Testnet",
            rpcUrls: ["http://118.175.0.249:8545"],
            nativeCurrency: { name: "MEC", symbol: "MEC", decimals: 18 }
          }]
        });
      } else { throw e; }
    }
  }

  async function connect() {
    if (!window.ethereum) { setTx("No wallet found. Install a browser wallet (e.g. MetaMask) to interact — read-only data above still works.", "err"); return; }
    try {
      setTx("Connecting wallet…");
      await ensureChain();
      var bp = new ethers.BrowserProvider(window.ethereum);
      var signer = await bp.getSigner();
      state.account = await signer.getAddress();
      walletNote();
      setTx("Wallet connected: " + esc(state.account), "ok");
      refresh();
    } catch (e) {
      setTx("Connect failed: " + esc(errMsg(e)), "err");
    }
  }

  async function signerContracts() {
    await ensureChain();
    var bp = new ethers.BrowserProvider(window.ethereum);
    var signer = await bp.getSigner();
    state.account = await signer.getAddress();
    return signer;
  }

  function errMsg(e) {
    if (!e) return "unknown error";
    if (e.shortMessage) return e.shortMessage;
    if (e.reason) return e.reason;
    if (e.code === 4001 || e.code === "ACTION_REJECTED") return "rejected in wallet";
    return e.message || String(e);
  }

  async function sendTx(label, fn) {
    try {
      setTx(label + ": waiting for wallet signature…");
      var tx = await fn();
      setTx(label + ': submitted — <span class="addr">' + esc(tx.hash) + "</span> · waiting for confirmation…");
      var rc = await tx.wait();
      setTx(label + ": confirmed in block " + rc.blockNumber + ' · <span class="addr">' + esc(tx.hash) + "</span>", "ok");
      refresh();
      return true;
    } catch (e) {
      setTx(label + " failed: " + esc(errMsg(e)), "err");
      return false;
    }
  }

  async function onCircleAction(act, address) {
    if (!window.ethereum) { setTx("Connect a wallet first.", "err"); return; }
    var found = null;
    for (var i = 0; i < state.circles.length; i++) if (state.circles[i].address.toLowerCase() === address.toLowerCase()) found = state.circles[i];
    try {
      var signer = await signerContracts();
      var c = circleContract(address, signer);
      if (act === "join") await sendTx("Join circle", function () { return c.join(); });
      else if (act === "deposit") {
        var amt = found ? found.contribution : 0n;
        await sendTx("Deposit", function () { return c.deposit({ value: amt }); });
      }
      else if (act === "advance") await sendTx("Advance round", function () { return c.advanceRound(); });
      else if (act === "withdraw") await sendTx("Withdraw", function () { return c.withdraw(); });
    } catch (e) {
      setTx("Failed: " + esc(errMsg(e)), "err");
    }
  }

  async function createCircle(ev) {
    ev.preventDefault();
    if (!window.ethereum) { setTx("Connect a wallet first — no browser wallet detected.", "err"); return; }
    var amount = $("cfAmount").value, seats = parseInt($("cfSeats").value, 10), days = parseInt($("cfDays").value, 10);
    if (!(Number(amount) > 0) || !(seats >= 3) || !(days >= 1)) { setTx("Check the form: contribution > 0, seats ≥ 3, days ≥ 1.", "err"); return; }
    try {
      var signer = await signerContracts();
      var cs = contracts(signer);
      var wei = ethers.parseEther(String(amount));
      var secs = BigInt(days * 86400);
      await sendTx("Create circle", function () {
        return cs.factory.createCircle(wei, BigInt(seats), secs, ethers.ZeroAddress);
      });
    } catch (e) {
      setTx("Create failed: " + esc(errMsg(e)), "err");
    }
  }

  /* ---------- boot: render first, probe later ---------- */
  function boot() {
    renderContracts();
    var had = loadCache();
    render();
    if (had) setLive("showing last known data — syncing…", true);
    walletNote();
    $("connectBtn").addEventListener("click", connect);
    $("refreshBtn").addEventListener("click", refresh);
    $("checkBtn").addEventListener("click", checkAddress);
    $("checkAddr").addEventListener("keydown", function (e) { if (e.key === "Enter") checkAddress(); });
    $("createForm").addEventListener("submit", createCircle);
    if (window.ethereum && window.ethereum.on) {
      window.ethereum.on("accountsChanged", function (accs) {
        state.account = accs && accs.length ? accs[0] : null;
        walletNote(); refresh();
      });
      window.ethereum.on("chainChanged", function () { walletNote(); });
    }
    // Probe in background — never block first paint on the RPC.
    setTimeout(refresh, 60);
    setInterval(function () { render(); }, 30000); // keep countdowns fresh locally
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
