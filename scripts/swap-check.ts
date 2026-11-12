// Check the anchor-USDC <-> savings swap both ways: `node --experimental-strip-types scripts/swap-check.ts <secret>`
import assert from 'node:assert'
import { Keypair } from '@stellar/stellar-sdk'
import { getBalances } from '../src/ajo.ts'
import { anchorBalance, moveToSavings, swapOut } from '../src/anchor.ts'
const k = Keypair.fromSecret(process.argv[2]); const me = { pub: k.publicKey(), secret: k.secret() }
const s0 = (await getBalances(me.pub))!.usdc, a0 = (await anchorBalance(me.pub)) ?? 0
console.log('before', { savings: s0, anchor: a0 })
if (a0 > 0) await moveToSavings(me, a0)
await swapOut(me, 1)
const s1 = (await getBalances(me.pub))!.usdc, a1 = (await anchorBalance(me.pub))!
console.log('after', { savings: s1, anchor: a1 })
assert.equal(s1.toFixed(7), (s0 + a0 - 1).toFixed(7)); assert.equal(a1.toFixed(7), '1.0000000')
await moveToSavings(me, 1)
console.log('OK: both directions; savings', (await getBalances(me.pub))!.usdc)
