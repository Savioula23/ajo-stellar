// End-to-end protocol check against Stellar testnet: `npm run smoke`
import assert from 'node:assert'
import { Keypair } from '@stellar/stellar-sdk'
import {
  ajoScore, canClaim, claimPot, createCircle, fundTestnet, getBalances, getTestUsdc, joinCircle, loadCircle, owes, payRound,
} from '../src/ajo.ts'

const wallet = () => { const k = Keypair.random(); return { pub: k.publicKey(), secret: k.secret() } }
const [ada, bola, chike] = [wallet(), wallet(), wallet()]
await Promise.all([ada, bola, chike].map((w) => fundTestnet(w.pub)))
for (const w of [ada, bola, chike]) await getTestUsdc(w, '100')

const code = await createCircle(ada, { name: 'Smoke test', you: 'Ada', amount: 10, size: 3, freq: 'weekly' })
let c = (await loadCircle(code))!
assert.deepEqual(c.members, [ada.pub], 'creator is member #1')

await joinCircle(bola, c, 'Bola')
await joinCircle(chike, c, 'Chike Okonkwo-Adeyemi')
c = (await loadCircle(code))!
assert.deepEqual(c.members, [ada.pub, bola.pub, chike.pub], 'join order is payout order')
assert.equal(c.names[bola.pub], 'Bola')
assert.ok(c.startedAt, 'circle starts when full')
assert.ok(owes(c, bola.pub) && !owes(c, ada.pub), 'recipient does not owe')

await payRound(bola, c)
await payRound(chike, c)
c = (await loadCircle(code))!
assert.ok(canClaim(c, ada.pub), 'pot claimable once everyone paid')

const r = await claimPot(ada, c)
assert.equal(r.total, 20)
c = (await loadCircle(code))!
assert.equal(c.round, 1, 'round advances after payout')
assert.equal((await getBalances(ada.pub))!.usdc, 120)
assert.equal(ajoScore([c], bola.pub).onTime, 1)
assert.equal(await loadCircle('ZZZZZZ'), null, 'unknown code resolves to nothing')

console.log(`OK: circle ${code} ran round 1 on testnet, Ada received ${r.total} USDC`)
