const freighter = () => import('@stellar/freighter-api') // lazy: only the browser needs it
import { Asset, BASE_FEE, Claimant, Horizon, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk'

// shortcut: demo "USDC" is issued by a throwaway testnet issuer; swap ISSUER for Circle's testnet USDC issuer to use the real thing.
export const server = new Horizon.Server('https://horizon-testnet.stellar.org')
export const explorer = (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`

// no secret = a real Freighter wallet that signs in the browser extension
export type Member = { name: string; pub: string; secret?: string }
export type Circle = { issuer: string; members: Member[]; amount: string }

const asset = (issuer: string) => new Asset('USDC', issuer)

async function submit(who: { pub: string; secret?: string }, ops: any[]) {
  const tb = new TransactionBuilder(await server.loadAccount(who.pub), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
  ops.forEach((o) => tb.addOperation(o))
  let tx = tb.setTimeout(120).build()
  if (who.secret) tx.sign(Keypair.fromSecret(who.secret))
  else {
    const r = await (await freighter()).signTransaction(tx.toXDR(), { networkPassphrase: Networks.TESTNET, address: who.pub })
    if (r.error) throw new Error('Freighter: ' + r.error.message)
    tx = TransactionBuilder.fromXDR(r.signedTxXdr, Networks.TESTNET) as typeof tx
  }
  return (await server.submitTransaction(tx)).hash as string
}

export async function connectFreighter() {
  const { isConnected, requestAccess, getNetwork } = await freighter()
  if (!(await isConnected()).isConnected) throw new Error('Freighter extension not found. Install it from freighter.app, then reload.')
  const a = await requestAccess()
  if (a.error) throw new Error('Freighter: ' + a.error.message)
  const n = await getNetwork()
  if (n.error || n.networkPassphrase !== Networks.TESTNET) throw new Error('Switch Freighter to Test Net, then try again')
  return a.address
}

async function friendbot(pub: string) {
  const r = await fetch(`https://friendbot.stellar.org?addr=${pub}`)
  if (!r.ok && !(await server.loadAccount(pub).catch(() => null))) throw new Error('Friendbot failed: ' + (await r.text()).slice(0, 120))
}

export async function createCircle(names: string[], amount: string, wallet?: string, startBalance = '100'): Promise<Circle> {
  if (names.length < 3) throw new Error('Need at least 3 members')
  const issuerKp = Keypair.random()
  const members: Member[] = names.map((name) => {
    const kp = Keypair.random()
    return { name, pub: kp.publicKey(), secret: kp.secret() }
  })
  if (wallet) members[0] = { name: members[0].name, pub: wallet }
  await Promise.all([issuerKp.publicKey(), ...members.map((m) => m.pub)].map(friendbot))
  const a = asset(issuerKp.publicKey())
  await Promise.all(members.map((m) => submit(m, [Operation.changeTrust({ asset: a })])))
  await submit({ pub: issuerKp.publicKey(), secret: issuerKp.secret() }, members.map((m) => Operation.payment({ destination: m.pub, asset: a, amount: startBalance })))
  return { issuer: issuerKp.publicKey(), members, amount }
}

/** Lock `amount` USDC so only `to` can claim it. */
export function contribute(c: Circle, from: Member, to: Member) {
  return submit(from, [
    Operation.createClaimableBalance({
      asset: asset(c.issuer),
      amount: c.amount,
      claimants: [new Claimant(to.pub, Claimant.predicateUnconditional())],
    }),
  ])
}

export async function claimAll(c: Circle, to: Member) {
  const res = await server.claimableBalances().claimant(to.pub).limit(100).call()
  const mine = res.records.filter((r: any) => r.asset === `USDC:${c.issuer}`)
  if (!mine.length) throw new Error('Nothing to claim')
  const hash = await submit(to, mine.map((r: any) => Operation.claimClaimableBalance({ balanceId: r.id })))
  return { hash, total: mine.reduce((s: number, r: any) => s + Number(r.amount), 0) }
}

export async function balance(c: Circle, pub: string) {
  const acc = await server.loadAccount(pub)
  const b: any = acc.balances.find((x: any) => x.asset_code === 'USDC' && x.asset_issuer === c.issuer)
  return b ? Number(b.balance) : 0
}
