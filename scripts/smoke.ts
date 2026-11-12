// Full round against Stellar testnet: run with `npm run smoke`
import assert from 'node:assert'
import { balance, claimAll, contribute, createCircle } from '../src/ajo.ts'

const c = await createCircle(['Ada', 'Bola', 'Chike'], '10')
const [a, b, d] = c.members
await contribute(c, b, a)
await contribute(c, d, a)
const { total } = await claimAll(c, a)
assert.equal(total, 20)
assert.equal(await balance(c, a.pub), 120)
assert.equal(await balance(c, b.pub), 90)
console.log('OK: round 1 paid out', total, 'USDC to', a.name)
