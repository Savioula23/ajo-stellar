import { Buffer } from 'buffer'
import { Asset, BASE_FEE, Claimant, Horizon, Keypair, Memo, Networks, Operation, TransactionBuilder, hash } from '@stellar/stellar-sdk'

const freighter = () => import('@stellar/freighter-api') // lazy: only the browser needs it

export const server = new Horizon.Server('https://horizon-testnet.stellar.org')
export const NETWORK = Networks.TESTNET
export const explorerTx = (h: string) => `https://stellar.expert/explorer/testnet/tx/${h}`
export const explorerAccount = (a: string) => `https://stellar.expert/explorer/testnet/account/${a}`

export type Signer = { pub: string; secret?: string }

const derive = (phrase: string) => Keypair.fromRawEd25519Seed(hash(Buffer.from(phrase)))

// shortcut: testnet "USDC" whose issuer key is derived from a public phrase, so anyone can mint test money.
// On mainnet, point USDC at Circle's issuer and delete getTestUsdc.
const issuer = derive('ajo:demo-usdc:v1')
export const USDC = new Asset('USDC', issuer.publicKey())
const DUST = '0.0000001' // XLM attached to every circle event so it lands in the circle account's history

// shortcut: the fee rides in the app's claim transaction, so a modified client could skip it; the Soroban contract is where it becomes enforceable.
export const TREASURY: string = (import.meta as any).env?.VITE_TREASURY || 'GBOWBC2K3H6GY6CNLDAJR6OSRSGJ7EYQEHWV7BXFSIAQXTCQIQJL4OUP'
export const FEE_BPS = 50 // 0.5% of each payout
export const feeOf = (total: number) => Math.round(total * FEE_BPS) / 10000

export async function submit(who: Signer, ops: any[], memo?: string, cosigners: Keypair[] = []) {
  const tb = new TransactionBuilder(await server.loadAccount(who.pub), { fee: BASE_FEE, networkPassphrase: NETWORK })
  ops.forEach((o) => tb.addOperation(o))
  if (memo) tb.addMemo(Memo.text(memo))
  let tx = tb.setTimeout(180).build()
  cosigners.forEach((k) => tx.sign(k))
  if (who.secret) tx.sign(Keypair.fromSecret(who.secret))
  else {
    const r = await (await freighter()).signTransaction(tx.toXDR(), { networkPassphrase: NETWORK, address: who.pub })
    if (r.error) throw new Error('Freighter: ' + r.error.message)
    tx = TransactionBuilder.fromXDR(r.signedTxXdr, NETWORK) as typeof tx
  }
  return (await server.submitTransaction(tx)).hash as string
}

export async function connectFreighter() {
  const { isConnected, requestAccess, getNetwork } = await freighter()
  if (!(await isConnected()).isConnected) throw new Error('Freighter extension not found. Install it from freighter.app, then reload.')
  const a = await requestAccess()
  if (a.error) throw new Error('Freighter: ' + a.error.message)
  const n = await getNetwork()
  if (n.error || n.networkPassphrase !== NETWORK) throw new Error('Switch Freighter to Test Net, then try again.')
  return a.address
}

const exists = (pub: string) => server.loadAccount(pub).then(() => true, () => false)

export async function fundTestnet(pub: string) {
  if (await exists(pub)) return
  const r = await fetch(`https://friendbot.stellar.org?addr=${pub}`)
  if (!r.ok && !(await exists(pub))) throw new Error('Testnet faucet is busy. Try again in a minute.')
}

export async function getBalances(pub: string) {
  const acc = await server.loadAccount(pub).catch(() => null)
  if (!acc) return null
  const u: any = acc.balances.find((b: any) => b.asset_code === 'USDC' && b.asset_issuer === USDC.issuer)
  const x: any = acc.balances.find((b: any) => b.asset_type === 'native')
  return { usdc: u ? Number(u.balance) : 0, xlm: x ? Number(x.balance) : 0, trusted: !!u }
}

export async function getTestUsdc(me: Signer, amount = '500') {
  await fundTestnet(issuer.publicKey())
  const b = await getBalances(me.pub)
  if (!b?.trusted) await submit(me, [Operation.changeTrust({ asset: USDC })])
  const pay = () => submit({ pub: issuer.publicKey(), secret: issuer.secret() }, [Operation.payment({ destination: me.pub, asset: USDC, amount })])
  // The shared issuer can race other users on its sequence number; one retry covers it.
  return pay().catch(pay)
}

/* ---------- Invite codes ---------- */

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ' // no 0/O, 1/I/L
export const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => ALPHABET[b % ALPHABET.length]).join('')
export const cleanCode = (s: string) => s.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6)
export const isCode = (s: string) => /^[2-9A-HJ-NP-Z]{6}$/.test(s)
export const showCode = (c: string) => `${c.slice(0, 3)}-${c.slice(3)}`
// The circle's account is derived from its code, so the code alone finds it. The derived key is disabled at creation.
const circleKeys = (code: string) => derive('ajo:circle:v1:' + code)

/* ---------- Circle protocol ---------- */

export type Freq = 'daily' | 'weekly' | 'monthly'
export type OrderMode = 'join' | 'draw'
export const PERIOD_MS: Record<Freq, number> = { daily: 864e5, weekly: 7 * 864e5, monthly: 30 * 864e5 }

export type CircleEvent = { kind: 'create' | 'join' | 'pay' | 'out'; who: string; round?: number; hash: string; at: number; late?: boolean }

export type Circle = {
  code: string; account: string; name: string; amount: number; size: number; freq: Freq; creator: string
  members: string[]; waitlist: string[]; names: Record<string, string>
  mode: OrderMode
  order: string[]          // payout order, set when the last seat fills
  paid: string[][]          // paid[r] = members who paid round r
  payouts: (CircleEvent | undefined)[]
  round: number             // current round index; === size when complete
  startedAt?: number        // when the last seat filled
  events: CircleEvent[]     // newest first
}

// Stellar text memos cap at 28 bytes; the display name gets whatever the prefix leaves.
const memoWith = (kind: string, name: string) => {
  let m = `${kind}:${name.trim().replace(/\s+/g, ' ')}`
  while (new TextEncoder().encode(m).length > 28) m = m.slice(0, -1)
  return m
}
export const nameOf = (c: Circle, pub: string) => c.names[pub] || `${pub.slice(0, 4)}…${pub.slice(-4)}`

export const pot = (c: Circle) => c.amount * (c.size - 1)
export const dueAt = (c: Circle, r: number) => (c.startedAt ? c.startedAt + (r + 1) * PERIOD_MS[c.freq] : undefined)
export const isFull = (c: Circle) => c.members.length >= c.size
export const isDone = (c: Circle) => c.round >= c.size
export const recipientOf = (c: Circle) => (isDone(c) || !isFull(c) ? undefined : c.order[c.round])
/** Payout order once known; before the circle fills, join order (or nothing yet for a draw). */
export const seatOrder = (c: Circle) => (isFull(c) ? c.order : c.mode === 'draw' ? [] : c.members)
export const owes = (c: Circle, pub: string) =>
  isFull(c) && !isDone(c) && c.members.includes(pub) && pub !== recipientOf(c) && !c.paid[c.round].includes(pub)
export const canClaim = (c: Circle, pub: string) =>
  isFull(c) && !isDone(c) && pub === recipientOf(c) && c.paid[c.round].length === c.size - 1

export async function createCircle(me: Signer, opts: { name: string; you: string; amount: number; size: number; freq: Freq; mode?: OrderMode }) {
  if (!opts.name.trim()) throw new Error('Give the circle a name.')
  if (!opts.you.trim()) throw new Error('Add your name so members know who you are.')
  if (!(opts.amount > 0)) throw new Error('Contribution must be more than 0.')
  if (!(opts.size >= 3 && opts.size <= 12)) throw new Error('Circles have 3 to 12 members.')
  const code = newCode()
  const c = circleKeys(code)
  if (await exists(c.publicKey())) throw new Error('Code collision. Please try again.')
  const data: Record<string, string> = {
    v: '1', name: opts.name.trim().slice(0, 40), amount: String(opts.amount), size: String(opts.size), freq: opts.freq,
    code, order: opts.mode ?? 'join',
  }
  await submit(me, [
    Operation.createAccount({ destination: c.publicKey(), startingBalance: '6' }),
    ...Object.entries(data).map(([k, v]) => Operation.manageData({ source: c.publicKey(), name: 'ajo.' + k, value: v })),
    Operation.setOptions({
      source: c.publicKey(), signer: { ed25519PublicKey: me.pub, weight: 1 },
      masterWeight: 0, lowThreshold: 1, medThreshold: 1, highThreshold: 1,
    }),
  ], memoWith('create', opts.you), [c])
  return code
}

export async function loadCircle(code: string): Promise<Circle | null> {
  const account = circleKeys(code).publicKey()
  const acc: any = await server.loadAccount(account).catch(() => null)
  const data = (k: string) => (acc?.data_attr?.['ajo.' + k] ? Buffer.from(acc.data_attr['ajo.' + k], 'base64').toString() : '')
  if (!acc || data('v') !== '1') return null

  const txs: any[] = []
  let page = await server.transactions().forAccount(account).order('asc').limit(200).call()
  txs.push(...page.records)
  while (page.records.length === 200) { page = await page.next(); txs.push(...page.records) }

  const size = Number(data('size'))
  const c: Circle = {
    code, account, name: data('name'), amount: Number(data('amount')), size, freq: (data('freq') || 'weekly') as Freq,
    creator: '', members: [], waitlist: [], names: {}, mode: data('order') === 'draw' ? 'draw' : 'join', order: [], paid: Array.from({ length: size }, () => []), payouts: [], round: 0, events: [],
  }
  for (const tx of txs) {
    if (!tx.successful) continue
    const memo: string = tx.memo_type === 'text' ? tx.memo : ''
    const who: string = tx.source_account
    const at = Date.parse(tx.created_at)
    const [kind, ...rest] = memo.split(':')
    const arg = rest.join(':')
    const round = Number(arg)
    if (kind === 'create' && !c.creator) {
      c.creator = who; c.members.push(who); c.names[who] = arg
      c.events.push({ kind: 'create', who, hash: tx.hash, at })
    } else if (kind === 'join' && c.creator && !c.members.includes(who)) {
      if (c.members.length < size) {
        c.members.push(who); c.names[who] = arg
        if (c.members.length === size) {
          c.startedAt = at
          c.order = c.mode === 'draw' ? await drawOrder(c.members, tx.ledger_attr ?? tx.ledger) : [...c.members]
        }
        c.events.push({ kind: 'join', who, hash: tx.hash, at })
      } else if (!c.waitlist.includes(who)) c.waitlist.push(who)
    } else if (kind === 'pay' && round === c.round && owes(c, who)) {
      c.paid[round].push(who)
      const due = dueAt(c, round)
      c.events.push({ kind: 'pay', who, round, hash: tx.hash, at, late: !!due && at > due })
    } else if (kind === 'out' && round === c.round && canClaim(c, who)) {
      const e: CircleEvent = { kind: 'out', who, round, hash: tx.hash, at }
      c.payouts[round] = e; c.events.push(e); c.round++
    }
  }
  c.events.reverse()
  return c
}

// Random payout order that anyone can re-derive: members sorted by sha256(ledger hash + address), using the
// ledger in which the last seat filled. shortcut: the last joiner could retry to influence which ledger that is; use the contract's PRNG for stakes that matter.
async function drawOrder(members: string[], ledger: number) {
  const seed = (await server.ledgers().ledger(ledger).call() as any).hash as string
  const key = (m: string) => Buffer.from(hash(Buffer.from(seed + m))).toString('hex')
  return [...members].sort((a, b) => (key(a) < key(b) ? -1 : 1))
}

/** Circles this wallet created or joined, found from its own ledger history, so any device can rebuild the list. */
export async function discoverCodes(pub: string) {
  const ops = await server.operations().forAccount(pub).order('desc').limit(200).call()
  const accounts = new Set<string>()
  for (const o of ops.records as any[]) {
    if (o.type === 'create_account' && o.funder === pub) accounts.add(o.account)
    if (o.type === 'payment' && o.from === pub && o.asset_type === 'native' && Number(o.amount) === Number(DUST)) accounts.add(o.to)
  }
  const found = await Promise.all([...accounts].map(async (a) => {
    const acc: any = await server.loadAccount(a).catch(() => null)
    const raw = acc?.data_attr?.['ajo.code']
    const code = raw ? Buffer.from(raw, 'base64').toString() : ''
    return isCode(code) && circleKeys(code).publicKey() === a ? code : null // must really derive to that account
  }))
  return found.filter((c): c is string => !!c)
}

export const joinCircle = (me: Signer, c: Circle, name: string) => {
  if (!name.trim()) throw new Error('Add your name so members know who you are.')
  if (c.members.includes(me.pub)) throw new Error("You're already in this circle.")
  if (isFull(c)) throw new Error('This circle is full.')
  return submit(me, [Operation.payment({ destination: c.account, asset: Asset.native(), amount: DUST })], memoWith('join', name))
}

export const payRound = (me: Signer, c: Circle) => {
  if (!owes(c, me.pub)) throw new Error("You don't owe anything this round.")
  return submit(me, [
    Operation.createClaimableBalance({
      asset: USDC, amount: String(c.amount), claimants: [new Claimant(recipientOf(c)!, Claimant.predicateUnconditional())],
    }),
    Operation.payment({ destination: c.account, asset: Asset.native(), amount: DUST }),
  ], `pay:${c.round}`)
}

export async function claimPot(me: Signer, c: Circle) {
  if (!canClaim(c, me.pub)) throw new Error('The pot is not ready yet.')
  const payers = new Set(c.paid[c.round])
  const res = await server.claimableBalances().claimant(me.pub).asset(USDC).limit(200).call()
  const picks: any[] = []
  for (const b of res.records as any[]) {
    if (payers.has(b.sponsor) && Number(b.amount) === c.amount) { picks.push(b); payers.delete(b.sponsor) }
  }
  if (!picks.length) throw new Error('No locked contributions found for you.')
  const total = picks.length * c.amount
  const fee = feeOf(total)
  const h = await submit(me, [
    ...picks.map((b) => Operation.claimClaimableBalance({ balanceId: b.id })),
    ...(fee > 0 ? [Operation.payment({ destination: TREASURY, asset: USDC, amount: fee.toFixed(7) })] : []),
    Operation.payment({ destination: c.account, asset: Asset.native(), amount: DUST }),
  ], `out:${c.round}`)
  return { hash: h, total, fee }
}

/* ---------- Ajo Score ---------- */

// Transparent on purpose: lenders and members can recompute it from the public ledger.
export function ajoScore(circles: Circle[], pub: string) {
  let onTime = 0, late = 0, completed = 0
  for (const c of circles) {
    for (const e of c.events) if (e.kind === 'pay' && e.who === pub) e.late ? late++ : onTime++
    if (isDone(c) && c.members.includes(pub)) completed++
  }
  const score = Math.max(300, Math.min(850, 500 + 25 * onTime - 40 * late + 20 * completed))
  return { score, onTime, late, completed }
}

export function friendlyError(e: any): string {
  const codes = e?.response?.data?.extras?.result_codes
  const ops: string[] = codes?.operations ?? []
  if (ops.includes('op_underfunded')) return 'Not enough USDC. Get test USDC from your wallet page.'
  if (ops.includes('op_no_trust')) return 'Your wallet has no USDC yet. Get test USDC from your wallet page.'
  if (ops.includes('op_low_reserve')) return 'Not enough XLM to cover the network reserve.'
  if (codes?.transaction === 'tx_bad_seq') return 'Another transaction went through first. Try again.'
  if (codes) return `Stellar rejected the transaction (${[codes.transaction, ...ops].filter(Boolean).join(', ')}).`
  return e?.message || 'Something went wrong.'
}
