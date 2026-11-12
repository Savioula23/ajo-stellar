// Stage setup: `npm run demo`
// Builds a real testnet circle where everyone has paid round 1, so the payout can be claimed live.
// Import the printed secret key on the Welcome page ("I already have a secret key") and press Claim.
import { Keypair } from '@stellar/stellar-sdk'
import { createCircle, fundTestnet, getTestUsdc, joinCircle, loadCircle, payRound, showCode } from '../src/ajo.ts'

const name = process.argv[2] || 'Boundless Build Day demo'
const w = () => { const k = Keypair.random(); return { pub: k.publicKey(), secret: k.secret() } }
const [you, bola, chike, dayo] = [w(), w(), w(), w()]
console.log('Funding 4 testnet wallets…')
await Promise.all([you, bola, chike, dayo].map((x) => fundTestnet(x.pub)))
for (const x of [you, bola, chike, dayo]) await getTestUsdc(x, '200')

console.log('Creating the circle and filling every seat…')
const code = await createCircle(you, { name, you: 'You', amount: 25, size: 4, freq: 'weekly' })
let c = (await loadCircle(code))!
for (const [x, n] of [[bola, 'Bola'], [chike, 'Chike'], [dayo, 'Dayo']] as const) await joinCircle(x, c, n)
c = (await loadCircle(code))!
console.log('Everyone else pays round 1…')
for (const x of [bola, chike, dayo]) await payRound(x, c)

console.log(`
Ready. Circle ${showCode(code)} has 75 USDC waiting for "You".
  1. Open the app, choose "I already have a secret key", paste:
     ${you.secret}
  2. Open the circle and press "Claim payout".
Other members' keys (to show their side on a second device):
  Bola  ${bola.secret}
  Chike ${chike.secret}
  Dayo  ${dayo.secret}
These are throwaway testnet keys.`)
