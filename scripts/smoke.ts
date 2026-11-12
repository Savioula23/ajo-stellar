// End-to-end protocol check against Stellar testnet: `npm run smoke`
import assert from 'node:assert'
import { Keypair } from '@stellar/stellar-sdk'
import {
  TREASURY, ajoScore, canClaim, claimPot, createCircle, discoverCodes, feeOf, fundTestnet, getBalances, getTestUsdc,
  joinCircle, loadCircle, owes, payRound, recipientOf,
} from '../src/ajo.ts'
import { createProtected, discoverProtected, idOf, joinProtected, loadProtected, payProtected, payoutProtected, protectedCode } from '../src/protected.ts'

const wallet = () => { const k = Keypair.random(); return { pub: k.publicKey(), secret: k.secret() } }
const [ada, bola, chike] = [wallet(), wallet(), wallet()]
await Promise.all([ada, bola, chike].map((w) => fundTestnet(w.pub)))
for (const w of [ada, bola, chike]) await getTestUsdc(w, '100')
const treasuryBefore = (await getBalances(TREASURY))!.usdc

// 1. Join-order circle, one full round with the service fee
const code = await createCircle(ada, { name: 'Smoke test', you: 'Ada', amount: 10, size: 3, freq: 'weekly' })
let c = (await loadCircle(code))!
assert.deepEqual(c.members, [ada.pub], 'creator is member #1')

await joinCircle(bola, c, 'Bola')
await joinCircle(chike, c, 'Chike Okonkwo-Adeyemi')
c = (await loadCircle(code))!
assert.deepEqual(c.order, [ada.pub, bola.pub, chike.pub], 'join order is payout order')
assert.equal(c.names[bola.pub], 'Bola')
assert.ok(c.startedAt, 'circle starts when full')
assert.ok(owes(c, bola.pub) && !owes(c, ada.pub), 'recipient does not owe')

await payRound(bola, c)
await payRound(chike, c)
c = (await loadCircle(code))!
assert.ok(canClaim(c, ada.pub), 'pot claimable once everyone paid')

const r = await claimPot(ada, c)
assert.equal(r.total, 20)
assert.equal(r.fee, feeOf(20))
c = (await loadCircle(code))!
assert.equal(c.round, 1, 'round advances after payout')
assert.equal((await getBalances(ada.pub))!.usdc.toFixed(7), (120 - r.fee).toFixed(7), 'recipient nets the pot minus the fee')
assert.equal((await getBalances(TREASURY))!.usdc.toFixed(7), (treasuryBefore + r.fee).toFixed(7), 'treasury receives the fee')
assert.equal(ajoScore([c], bola.pub).onTime, 1)
assert.equal(await loadCircle('ZZZZZZ'), null, 'unknown code resolves to nothing')

// 2. Random-draw circle: order is a permutation fixed when the last seat fills
const drawCode = await createCircle(bola, { name: 'Draw test', you: 'Bola', amount: 5, size: 3, freq: 'daily', mode: 'draw' })
let d = (await loadCircle(drawCode))!
assert.equal(recipientOf(d), undefined, 'no recipient before the draw')
await joinCircle(ada, d, 'Ada')
await joinCircle(chike, d, 'Chike')
d = (await loadCircle(drawCode))!
assert.deepEqual([...d.order].sort(), [...d.members].sort(), 'draw is a permutation of members')
assert.deepEqual((await loadCircle(drawCode))!.order, d.order, 'draw is reproducible by anyone')

// 3. Any device can rebuild a wallet's circle list from the ledger
const found = await discoverCodes(chike.pub)
assert.ok(found.includes(code) && found.includes(drawCode), 'joined circles are discovered')
assert.ok((await discoverCodes(ada.pub)).includes(code), 'created circles are discovered')

// 4. Protected circle in the Soroban contract: deposits held, rules enforced on-chain
assert.equal(idOf(protectedCode(12345)), 12345, 'protected code round-trips')
const pcode = await createProtected(ada, { name: 'Protected test', you: 'Ada', amount: 5, deposit: 5, size: 3, freq: 'weekly', draw: false })
let p = (await loadProtected(pcode))!
assert.equal(p.name, 'Protected test')
await joinProtected(bola, p, 'Bola')
await joinProtected(chike, p, 'Chike')
p = (await loadProtected(pcode))!
assert.deepEqual(p.order, [ada.pub, bola.pub, chike.pub])
assert.equal(p.protected!.deposits[bola.pub], 5, 'deposit is held by the contract')
await payProtected(bola, p)
await payProtected(chike, p)
const adaBefore = (await getBalances(ada.pub))!.usdc
await payoutProtected(ada, (await loadProtected(pcode))!)
p = (await loadProtected(pcode))!
assert.equal(p.round, 1, 'contract advanced the round')
assert.equal((await getBalances(ada.pub))!.usdc.toFixed(7), (adaBefore + 10).toFixed(7), 'contract paid the pot')
assert.equal(ajoScore([p], bola.pub).onTime, 1, 'on-chain on-time count feeds the score')
assert.ok((await discoverProtected(chike.pub)).includes(pcode), 'protected circles are discovered from the contract')

console.log(`OK: ${code} paid out ${r.total} USDC (fee ${r.fee}); draw ${drawCode} order fixed; discovery found ${found.length} circles; protected ${pcode} paid out via contract`)
