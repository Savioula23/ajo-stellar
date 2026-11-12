// Stage setup: `npm run demo`
// Builds a real protected (smart-contract) circle on testnet where everyone has paid round 1,
// so the payout can be claimed live. Import the printed key on the Welcome page
// ("I already have a secret key") and press "Claim payout".
import { Keypair } from '@stellar/stellar-sdk'
import { fundTestnet, getTestUsdc, showCode } from '../src/ajo.ts'
import { createProtected, joinProtected, loadProtected, payProtected } from '../src/protected.ts'

const name = process.argv[2] || 'Boundless Build Day demo'
const w = () => { const k = Keypair.random(); return { pub: k.publicKey(), secret: k.secret() } }
const [you, bola, chike, dayo] = [w(), w(), w(), w()]
console.log('Funding 4 testnet wallets with XLM and test USDC…')
await Promise.all([you, bola, chike, dayo].map((x) => fundTestnet(x.pub)))
for (const x of [you, bola, chike, dayo]) await getTestUsdc(x, '200')

console.log('Creating a protected circle in the Ajo contract and filling every seat…')
const code = await createProtected(you, { name, you: 'You', amount: 25, deposit: 25, size: 4, freq: 'weekly', draw: false })
let c = (await loadProtected(code))!
for (const [x, n] of [[bola, 'Bola'], [chike, 'Chike'], [dayo, 'Dayo']] as const) await joinProtected(x, c, n)
c = (await loadProtected(code))!
console.log('Everyone else pays round 1…')
for (const x of [bola, chike, dayo]) await payProtected(x, c)

console.log(`
Ready. Circle ${showCode(code)} has ₦112,500 (75 USDC) in the contract waiting for "You".
  1. Open the app, choose "I already have a secret key", paste:
     ${you.secret}
  2. Open the circle and press "Claim payout". The Protection panel shows every deposit held.
Other members' keys (to show their side on a second device):
  Bola  ${bola.secret}
  Chike ${chike.secret}
  Dayo  ${dayo.secret}
These are throwaway testnet keys.`)
