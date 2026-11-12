import { Buffer } from 'buffer'
import { Asset, Keypair, Memo, Operation, StellarToml, TransactionBuilder, WebAuth } from '@stellar/stellar-sdk'
import { NETWORK, server, submit, type Signer } from './ajo.ts'

// shortcut: SDF's public test anchor. For launch, point ANCHOR_DOMAIN at a licensed naira anchor; the SEP-10/24 flow is identical.
export const ANCHOR_DOMAIN = 'testanchor.stellar.org'
const ANCHOR_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' // Circle's testnet USDC
export const ANCHOR_USDC = new Asset('USDC', ANCHOR_ISSUER)

const info = () => StellarToml.Resolver.resolve(ANCHOR_DOMAIN)

async function signXdr(me: Signer, xdr: string) {
  const tx = TransactionBuilder.fromXDR(xdr, NETWORK)
  if (me.secret) { tx.sign(Keypair.fromSecret(me.secret)); return tx.toXDR() }
  const r = await (await import('@stellar/freighter-api')).signTransaction(xdr, { networkPassphrase: NETWORK, address: me.pub })
  if (r.error) throw new Error('Freighter: ' + r.error.message)
  return r.signedTxXdr
}

/** SEP-10: prove we own the account and get a session token from the anchor. */
async function login(me: Signer) {
  const t: any = await info()
  const res = await fetch(`${t.WEB_AUTH_ENDPOINT}?account=${me.pub}`)
  const { transaction } = await res.json()
  // Refuse anything that is not a genuine challenge signed by the anchor's published key.
  WebAuth.readChallengeTx(transaction, t.SIGNING_KEY, NETWORK, ANCHOR_DOMAIN, new URL(t.WEB_AUTH_ENDPOINT).host)
  const signed = await signXdr(me, transaction)
  const out = await fetch(t.WEB_AUTH_ENDPOINT, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transaction: signed }),
  }).then((r) => r.json())
  if (!out.token) throw new Error(out.error || 'The anchor did not accept the login.')
  return { token: out.token as string, transfer: t.TRANSFER_SERVER_SEP0024 as string }
}

export async function anchorBalance(pub: string) {
  const acc: any = await server.loadAccount(pub).catch(() => null)
  const b = acc?.balances.find((x: any) => x.asset_code === ANCHOR_USDC.code && x.asset_issuer === ANCHOR_ISSUER)
  return b ? Number(b.balance) : null // null = no trustline yet
}

/**
 * SEP-24: open the anchor's own KYC and bank-details form. `popup` must be opened by the click handler
 * (browsers block popups opened after an await). For a withdrawal, once the user finishes the form we
 * send the USDC to the anchor with the memo it asks for.
 */
export async function startTransfer(me: Signer, kind: 'deposit' | 'withdraw', popup: Window | null, onStatus: (s: string) => void) {
  if ((await anchorBalance(me.pub)) === null) {
    onStatus('Adding USDC to your wallet…')
    await submit(me, [Operation.changeTrust({ asset: ANCHOR_USDC })])
  }
  onStatus('Signing in to the anchor…')
  const { token, transfer } = await login(me)
  const body = new FormData()
  body.append('asset_code', ANCHOR_USDC.code)
  body.append('asset_issuer', ANCHOR_ISSUER)
  body.append('account', me.pub)
  body.append('lang', 'en')
  const r = await fetch(`${transfer}/transactions/${kind}/interactive`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body })
    .then((x) => x.json())
  if (!r.url) throw new Error(r.error || 'The anchor did not start the transfer.')
  if (popup && !popup.closed) popup.location.href = r.url
  else window.open(r.url, '_blank')
  onStatus('Finish the steps in the anchor window…')

  for (let i = 0; i < 120; i++) { // up to ~10 minutes
    await new Promise((res) => setTimeout(res, 5000))
    const { transaction: tx } = await fetch(`${transfer}/transaction?id=${r.id}`, { headers: { Authorization: `Bearer ${token}` } }).then((x) => x.json())
    if (!tx) continue
    if (kind === 'withdraw' && tx.status === 'pending_user_transfer_start') {
      onStatus(`Sending ${tx.amount_in} USDC to the anchor…`)
      const memo = tx.withdraw_memo_type === 'id' ? Memo.id(tx.withdraw_memo) : tx.withdraw_memo_type === 'hash' ? Memo.hash(Buffer.from(tx.withdraw_memo, 'base64').toString('hex')) : Memo.text(tx.withdraw_memo)
      await submitWithMemo(me, tx.withdraw_anchor_account, tx.amount_in, memo)
      onStatus('Sent. Waiting for the anchor to pay out…')
    } else if (tx.status === 'completed') {
      onStatus(kind === 'deposit' ? `Received ${tx.amount_out ?? tx.amount_in} USDC.` : 'Cash-out complete.')
      return
    } else if (['error', 'expired', 'refunded', 'no_market', 'too_small', 'too_large'].includes(tx.status)) {
      throw new Error(`The anchor reported "${tx.status}". ${tx.message ?? ''}`)
    } else {
      onStatus(`Anchor status: ${tx.status.replace(/_/g, ' ')}…`)
    }
  }
  onStatus('Still pending at the anchor. Check back later.')
}

async function submitWithMemo(me: Signer, to: string, amount: string, memo: Memo) {
  const tb = new TransactionBuilder(await server.loadAccount(me.pub), { fee: '100', networkPassphrase: NETWORK })
    .addOperation(Operation.payment({ destination: to, asset: ANCHOR_USDC, amount }))
    .addMemo(memo).setTimeout(180)
  const xdr = await signXdr(me, tb.build().toXDR())
  return (await server.submitTransaction(TransactionBuilder.fromXDR(xdr, NETWORK))).hash
}

