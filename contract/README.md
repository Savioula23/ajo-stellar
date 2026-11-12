# Ajo Soroban contract

Rotating savings circles with rules the network enforces. One deployed contract hosts many circles.

**Testnet deployment:** `CCBAYNMDKGMCJFLGOCSLDMW7HKUDESINUJKHJDS7EU6LDKE3GHOCBNEM`
([view](https://stellar.expert/explorer/testnet/contract/CCBAYNMDKGMCJFLGOCSLDMW7HKUDESINUJKHJDS7EU6LDKE3GHOCBNEM)).
Circle 0 on it ran a full round with real testnet XLM.

## What it enforces that the app alone cannot

| Function | Rule |
|---|---|
| `create(organizer, token, amount, deposit, size, period, grace, draw)` | Organiser takes seat 1 and pays a refundable deposit. |
| `join(id, member)` | Pays the deposit. When the last seat fills, the payout order is fixed (join order, or a shuffle from the network PRNG) and the clock starts. |
| `pay(id, member)` | Exactly one payment per member per round; the recipient cannot pay. On-time and late payments are counted on-chain. |
| `cover(id, member)` | After the due date plus grace, **anyone** can pay a missing member's share from their deposit, so the recipient is never short. Counts as late. |
| `bid(id, member, amount)` | A member with a later seat bids to take this round. Bid must be at least one contribution and less than the pot. |
| `payout(id)` | Permissionless once everyone has paid. Highest bidder swaps seats with the scheduled recipient: bidder gets pot − bid (plus their own payment back), displaced member gets bid − their share. |
| `refund(id, member)` | After the last round, returns what is left of the deposit. |
| `get(id)`, `count()` | Read state. |

Money in always equals money out; `highest_bid_takes_the_round` checks the contract balance after a swap.

## Build, test, deploy (Windows)

This machine has no Visual Studio Build Tools, so builds use Rust's GNU toolchain, which brings its own linker:

```powershell
rustup toolchain install stable-x86_64-pc-windows-gnu --profile minimal
rustup target add wasm32v1-none --toolchain stable-x86_64-pc-windows-gnu
$env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-gnu'
cargo test                      # 5 tests
stellar contract build          # target/wasm32v1-none/release/ajo.wasm
stellar contract deploy --wasm target/wasm32v1-none/release/ajo.wasm --source-account ajo-deployer --network testnet --alias ajo
```

Run these from PowerShell, not Git Bash: Git Bash's `link` command shadows the linker.

## Try it

```powershell
$XLM = stellar contract id asset --asset native --network testnet
stellar contract invoke --id ajo --network testnet --source-account ajo-deployer -- create --organizer ajo-deployer --token $XLM --amount 10000000 --deposit 10000000 --size 2 --period 60 --grace 60 --draw false
stellar contract invoke --id ajo --network testnet --source-account ajo-member -- join --id 1 --member ajo-member
stellar contract invoke --id ajo --network testnet --source-account ajo-member -- pay --id 1 --member ajo-member
stellar contract invoke --id ajo --network testnet --source-account ajo-member -- payout --id 1
stellar contract invoke --id ajo --network testnet --source-account ajo-member -- get --id 1
```
