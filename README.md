# Ajo — nobody holds the pot

Ajo (esusu, adashe) is the rotating savings circle millions of Nigerians already run: everyone pays in each round, one member takes the pot, and it rotates until everyone has been paid. Its weak point has always been trust. The treasurer can disappear with the money, and a member can stop paying after their turn.

Ajo moves the pot onto Stellar. Each contribution is a **claimable balance** that only that round's recipient can claim, so no treasurer ever holds the money and every payment is public on the ledger.

## What the demo shows

- Create a circle: every member gets a funded testnet wallet, a USDC trustline and 100 demo USDC.
- The ring: members sit on a circle. Paying sends a coin into the pot, claiming sends the pot to the recipient, and the ring turns so the next recipient sits at the top.
- Ajo Score: every contribution raises the member's score (demo formula: 500 + 40 per contribution, capped at 850).
- On-chain ledger: every transaction links to Stellar Expert.
- Freighter: connect a real wallet as the first member and sign your own payments.

## Why it can be a business

1. **Trust layer for informal savings.** A circle that can't be run off with is something people already want, and Ajo charges a small fee on each payout.
2. **Ajo Score → credit.** A record of on-time contributions is a credit signal for people banks can't score. That record is the asset: lenders pay to underwrite against it.
3. **Diaspora circles.** Family abroad pays in USDC and the recipient cashes out to naira through a Stellar anchor, so the circle doubles as a remittance rail.

## Run

```bash
npm install
npm run dev     # http://localhost:5173
npm run smoke   # one full round against Stellar testnet
```

## Honest limits

- Testnet only. Demo wallets live in the browser's localStorage.
- "USDC" is a demo asset from a throwaway issuer. Change the issuer in `src/ajo.ts` for Circle's testnet USDC.
- Payout order and defaults are not enforced on-chain yet. That needs a Soroban contract, which is the next step.
- Ajo Score is a transparent demo formula over one circle, not a real credit model.
