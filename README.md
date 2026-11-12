# Ajo — savings circles nobody can run off with

Ajo (esusu, adashe) is the rotating savings circle millions of Nigerians already run. Everyone pays in each round, one member takes the pot, and it rotates until everyone has been paid. The weak point has always been trust: the treasurer can disappear, or a member can stop paying after their turn.

Ajo puts the circle on Stellar. There is no treasurer and no backend server.

**Live:** https://ajo-stellar.vercel.app (Stellar testnet)

## Two kinds of circle

| | **Protected** (default) | **Standard** |
|---|---|---|
| Runs on | The Ajo Soroban contract (`contract/`) | Plain Stellar accounts and claimable balances |
| Deposit | Refundable, held by the contract | None |
| Missed payment | After the grace period anyone can cover it from the late member's deposit | Nothing covers it |
| Early payout | Members can bid to take a round early | — |
| Payout order | Join order, or a shuffle by the network PRNG | Join order, or a draw seeded by the ledger hash |
| Fee | None yet (see roadmap) | 0.5% of each payout to the treasury |
| Code | `1AB-CDE` (starts with 1) | `7KQ-2XM` |

## How it works

- **Invite codes.** Standard circle accounts are derived from their 6-character code; the derived key is disabled at creation, so the code finds the circle but gives no control. Protected codes encode the contract's circle id.
- **The ledger is the database.** Standard circles replay tagged transactions (`join:<name>`, `pay:<round>`, `out:<round>`); protected circles read the contract's state.
- **Any device.** Your circle list is rebuilt from your wallet's own ledger history.
- **Ajo Score** = 500 + 25 per on-time payment − 40 per late payment + 20 per completed circle, kept in 300–850. Public and checkable at `#/score/<address>`.
- **Money in and out** through a Stellar anchor (SEP-10 sign-in + SEP-24 hosted KYC), wired to SDF's test anchor.
- **Sharing.** QR code, WhatsApp invite, WhatsApp payment reminders, and a calendar file of due dates.

## Pages

`#/` circles · `#/new` create · `#/join/CODE` join · `#/c/CODE` circle · `#/wallet` wallet, cash in/out, score · `#/score/ADDRESS` public record

## Commands

```bash
npm install
npm run dev     # http://localhost:5173
npm run smoke   # protocol + contract against testnet
npm run e2e     # 3 people run a protected round through the real UI in Edge
npm run demo    # stage setup: a circle one click from payout
```

Contract: see [contract/README.md](contract/README.md) (5 Rust tests, testnet deployment).

## Configuration

`.env.local` (not committed): `VITE_TREASURY`, `TREASURY_SECRET` (testnet treasury), optional `VITE_AJO_CONTRACT`, `VITE_USDC_SAC`.

## Honest limits

- Testnet only. Demo "USDC" has a public issuer key so anyone can mint it; on mainnet use Circle's USDC.
- In-browser wallets keep the secret key in localStorage until passkeys land.
- The standard-circle fee and draw are enforced by the app, not a contract.
