import { Keypair, contract } from '@stellar/stellar-sdk'
import { NETWORK, issuer, type Circle, type Freq, type Signer } from './ajo.ts'
import { signAndRelay } from './passkey.ts'

// Protected circles live in the Ajo Soroban contract (contract/): deposits, default cover and early-payout bids.
const env = (import.meta as any).env ?? {}
export const AJO_CONTRACT: string = env.VITE_AJO_CONTRACT || 'CD3DQJD4NVU2OHGM4LTRUMJAH6XK2LFGGE3ZRZTRUH7XJ37VZ4K36BFT'
export const USDC_SAC: string = env.VITE_USDC_SAC || 'CDUOS2DVLQUE5RHAYH77PE7H5TVESRXVWSDIKSEL3U3XD25GRKNTHMLQ'
const RPC_URL = 'https://soroban-testnet.stellar.org'
const UNIT = 10_000_000 // USDC has 7 decimals
const PERIOD_S: Record<Freq, number> = { daily: 86_400, weekly: 7 * 86_400, monthly: 30 * 86_400 }

/* ---------- Codes: protected circles get "1" + the contract id in base 31, so they never clash with standard codes ---------- */

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const isProtectedCode = (code: string) => /^1[2-9A-HJ-NP-Z]{5}$/.test(code)
export function protectedCode(id: number) {
  let s = ''
  for (let n = id, i = 0; i < 5; i++, n = Math.floor(n / 31)) s = ALPHABET[n % 31] + s
  return '1' + s
}
export const idOf = (code: string) => [...code.slice(1)].reduce((n, ch) => n * 31 + ALPHABET.indexOf(ch), 0)

/* ---------- Client ---------- */

function signer(me: Signer): contract.ClientOptions['signTransaction'] {
  if (me.secret) return contract.basicNodeSigner(Keypair.fromSecret(me.secret), NETWORK).signTransaction
  return async (xdr: string) => {
    const r = await (await import('@stellar/freighter-api')).signTransaction(xdr, { networkPassphrase: NETWORK, address: me.pub })
    if (r.error) throw new Error('Freighter: ' + r.error.message)
    return { signedTxXdr: r.signedTxXdr, signerAddress: r.signerAddress }
  }
}

const clients = new Map<string, Promise<any>>()
function client(me?: Signer): Promise<any> {
  const key = me?.pub ?? 'read'
  if (!clients.has(key)) {
    clients.set(key, contract.Client.from({
      contractId: AJO_CONTRACT, networkPassphrase: NETWORK, rpcUrl: RPC_URL,
      // A passkey wallet is a contract and cannot source transactions; simulate from a funded account, the relayer pays.
      ...(me?.keyId ? { publicKey: issuer.publicKey() } : me ? { publicKey: me.pub, signTransaction: signer(me) } : {}),
    }).catch((e) => { clients.delete(key); throw e }))
  }
  return clients.get(key)!
}

async function send(me: Signer, method: string, args: Record<string, unknown>) {
  const tx = await (await client(me))[method](args)
  if (me.keyId) return signAndRelay(me, tx)
  const sent = await tx.signAndSend()
  return sent.result
}

/* ---------- Reads: map contract state onto the same Circle shape the UI already renders ---------- */

const usd = (v: bigint | number) => Number(v) / UNIT
// The SDK returns contract maps as arrays of [key, value] pairs.
const toMap = (m: any): Map<string, any> => (m instanceof Map ? m : Array.isArray(m) ? new Map(m) : new Map(Object.entries(m ?? {})))

export async function loadProtected(code: string): Promise<Circle | null> {
  const id = idOf(code)
  const c = await client()
  let s: any
  try { s = (await c.get({ id })).result } catch { return null } // NotFound
  if (!s || s.name === undefined) return null
  const period = Number(s.period)
  const freq = (Object.entries(PERIOD_S).find(([, v]) => v === period)?.[0] ?? 'weekly') as Freq
  const names = Object.fromEntries([...toMap(s.names)].map(([k, v]) => [k, String(v)]))
  const size = Number(s.size)
  const round = Number(s.round)
  const paid: string[][] = Array.from({ length: size }, () => [])
  if (round < size) paid[round] = [...s.paid]
  return {
    code, account: AJO_CONTRACT, name: String(s.name), amount: usd(s.amount), size, freq, creator: s.organizer,
    members: [...s.members], waitlist: [], names, mode: s.draw ? 'draw' : 'join', order: [...s.order],
    paid, payouts: [], round, startedAt: s.order.length ? Number(s.start) * 1000 : undefined, events: [],
    periodMs: period * 1000,
    protected: {
      id, deposit: usd(s.deposit), graceMs: Number(s.grace) * 1000,
      deposits: Object.fromEntries([...toMap(s.deposits)].map(([k, v]) => [k, usd(v)])),
      onTime: Object.fromEntries([...toMap(s.on_time)].map(([k, v]) => [k, Number(v)])),
      late: Object.fromEntries([...toMap(s.late)].map(([k, v]) => [k, Number(v)])),
      bidder: s.bidder ?? undefined, bid: usd(s.bid),
    },
  }
}

/* ---------- Writes ---------- */

const units = (n: number) => BigInt(Math.round(n * UNIT))

export async function createProtected(me: Signer, o: { name: string; you: string; amount: number; deposit: number; size: number; freq: Freq; draw: boolean }) {
  if (!o.name.trim() || !o.you.trim()) throw new Error('Add a circle name and your name.')
  const id = await send(me, 'create', {
    organizer: me.pub, name: o.name.trim().slice(0, 40), organizer_name: o.you.trim().slice(0, 32), token: USDC_SAC,
    amount: units(o.amount), deposit: units(o.deposit), size: o.size, period: BigInt(PERIOD_S[o.freq]), grace: BigInt(86_400), draw: o.draw,
  })
  return protectedCode(Number(id))
}
export const joinProtected = (me: Signer, c: Circle, name: string) =>
  send(me, 'join', { id: c.protected!.id, member: me.pub, name: name.trim().slice(0, 32) })
export const payProtected = (me: Signer, c: Circle) => send(me, 'pay', { id: c.protected!.id, member: me.pub })
export const payoutProtected = (me: Signer, c: Circle) => send(me, 'payout', { id: c.protected!.id })
export const coverProtected = (me: Signer, c: Circle, member: string) => send(me, 'cover', { id: c.protected!.id, member })
export const bidProtected = (me: Signer, c: Circle, amount: number) => send(me, 'bid', { id: c.protected!.id, member: me.pub, amount: units(amount) })
export const refundProtected = (me: Signer, c: Circle) => send(me, 'refund', { id: c.protected!.id, member: me.pub })

/** Protected circles this wallet belongs to, found by reading the contract directly. */
// shortcut: scans every circle id (fine for thousands); add an on-chain member index before scale.
export async function discoverProtected(pub: string) {
  const c = await client()
  const count = Number((await c.count()).result)
  const codes: string[] = []
  for (let start = Math.max(0, count - 300); start < count; start += 20) {
    const batch = await Promise.all(Array.from({ length: Math.min(20, count - start) }, (_, i) =>
      c.get({ id: start + i }).then((r: any) => [start + i, r.result] as const, () => [start + i, null] as const)))
    for (const [id, s] of batch) if (s && [...s.members].includes(pub)) codes.push(protectedCode(id))
  }
  return codes
}
