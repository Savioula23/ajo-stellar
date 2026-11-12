# Ajo — savings circles nobody can run off with

Ajo (esusu, adashe) is the rotating savings circle millions of Nigerians already run. Everyone pays in each round, one member takes the pot, and it rotates until everyone has been paid. The weak point has always been trust: the treasurer can disappear with the money.

Ajo puts the circle on Stellar. There is no treasurer and no backend.

## How it works

- **Invite codes.** Creating a circle makes a 6-character code (`7KQ-2XM`). The circle's Stellar account is derived from that code, so the code alone finds it on any device. At creation the derived key is disabled and the organiser becomes the only signer, so knowing the code gives no control.
- **The ledger is the database.** The circle's config lives in data entries on its account. Joining, paying and paying out are transactions tagged `join:<name>`, `pay:<round>` and `out:<round>`. Every device rebuilds the same state from public history.
- **Nobody holds the pot.** Each contribution is a claimable balance that only that round's recipient can claim.
- **Payout order is join order.** Due dates start when the last seat fills.
- **Ajo Score** is computed from on-chain payments: 500, plus 25 per on-time payment, minus 40 per late payment, plus 20 per completed circle, kept between 300 and 850. Anyone can recompute it.

## Pages

| Route | What it does |
|---|---|
| `#/` | Your circles, what needs you, Ajo Score |
| `#/new` | Create a circle and get its code |
| `#/join/CODE` | Preview a circle and take a seat (share links land here) |
| `#/c/CODE` | Invite pass, next step (pay / claim), rotation schedule, members, activity |
| `#/wallet` | Balances, test USDC, score breakdown, key backup |

Wallets: an in-browser key (funded by testnet Friendbot) or Freighter.

## Run

```bash
npm install
npm run dev     # http://localhost:5173
npm run smoke   # full protocol round against Stellar testnet
```

## Why it can be a business

1. **Trust layer for informal savings.** A small fee on each payout, for a circle nobody can run off with.
2. **Ajo Score as credit.** A verifiable record of on-time contributions for people banks can't score. Lenders pay to underwrite against it.
3. **Diaspora circles.** Family abroad pays in USDC and the recipient cashes out to naira through a Stellar anchor.

## Honest limits

- Testnet only. "USDC" is a test asset whose issuer key is public so anyone can mint it; on mainnet point `USDC` at Circle's issuer in `src/ajo.ts`.
- In-browser wallets keep the secret key in localStorage. Production needs passkeys or a proper wallet.
- Your circle list is saved per device; on a new device, open the circle again with its code.
- Order and payments are enforced by the app's reading of the ledger, not by a contract. A Soroban contract would enforce defaults and payout order on-chain.
