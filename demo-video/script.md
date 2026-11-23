# MECircle — Demo Video Script (narration, English)

Target: 3–5 minutes total. Narration ≈ 130 wpm → script ≈ 540 words.
Voiceover: English TTS. Subtitles: the same text, burned in.
Scenes: [TITLE] title slide · [SITE] live-site screen capture ·
[CHAIN] on-chain records slide · [CLOSE] closing slide.

---

**[TITLE — 0:00]**

Every week, in villages and cities across Indonesia, Kenya, Mexico, and
India, millions of people sit down for one of the oldest financial rituals
on earth: the rotating savings circle.

**[SITE — problem]**

Ten friends each put in the same amount of money. One of them takes the
whole pot home. Next week, they do it again, and the pot rotates — until
everyone has had their turn. No bank. No interest. No paperwork.

It works beautifully — until it doesn't. The person who takes the first pot
can simply disappear. Someone who stops paying cannot be made to pay. And
when it falls apart, there is no record. The defaulter just joins another
circle, in another place, under the same old zero trust.

**[TITLE — solution]**

This is MECircle. We brought the rotating savings circle on-chain, to ME
Network — and we replaced social pressure with something much stronger:
verified identity, and a reputation that can never be erased.

**[SITE — tour]**

Here is the live demo, reading real state from the ME Network testnet,
right now. This is the Circle Factory. It shows every circle ever created
by the contracts. Circle number one is our completed end-to-end run:
three members, three rounds, every pot paid. Circle number two is live —
an active circle with seven-day rounds. All three members have joined and
deposited, and you can see the pot — zero point zero three MEC — collected
and held by the contract, waiting for the round to close.

**[SITE — address check]**

Now the identity layer. I paste in a member's address, and the demo checks
two things on-chain. First: is this wallet attested as a verified ME ID
holder? Yes. Second: what is its reputation? Three rounds paid on time.
Zero defaults. One circle completed. That record is public, permanent, and
written by the contracts themselves — no one can edit it, and no one can
leave it behind.

**[CHAIN — how it works]**

How does it work? Four contracts. The Attestation Registry is the gate:
ME ID verification happens inside ME Pass, and an authorized attestor
records the result on-chain. The Circle Factory creates savings circles.
Each Savings Circle locks the contributions and pays each round's pot
automatically, in join order. And the Reputation Ledger writes down every
on-time payment — and every default — forever.

Three rules make it safe. One: no admin can ever touch the members' money —
there is simply no function for it. Two: the pot is exactly what the round
collected, so the contract always returns to zero; nothing can get stuck.
Three: a default does not kick you out — real circles don't work that way —
but it is written on your identity, permanently, for every future circle
to see.

**[CHAIN — run records]**

And this is not a mock-up. The contracts are deployed on ME Network
testnet, and the full first circle already ran on-chain: three members,
three rounds, every pot paid to the exact wei, final balance zero,
reputations written. Every transaction hash is in the repository, and
anyone can re-verify the whole run with one script.

**[CLOSE]**

Hundreds of millions of people already save this way. They never needed a
new financial product — they needed trust that travels. ME ID gives them
an identity. MECircle gives that identity a memory. That is how the
world's oldest bank finally gets its credit history.

MECircle — rotating savings, verified by ME ID, remembered by the chain.

---

## Production notes

- Slides: title/closing rendered as PNG (dark green theme, MECircle wordmark,
  tagline). Site scenes: headless-Chromium screenshots of
  https://mecircle.fcfs.workers.dev (factory overview incl. both circles,
  circle #2 detail, address-check panel for member1 showing Verified +
  3/0/1 reputation).
- Music: quiet electronic bed under narration at low volume.
- Subtitles: burn-in from the narration text, timed to the TTS segments.
- Verify final file: ffprobe duration within 180–300 s, audio stream present.
