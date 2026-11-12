import { Buffer } from 'buffer'
import { Address, Asset, Keypair, Memo, Operation, StellarToml, TransactionBuilder, WebAuth, scValToNative, xdr } from '@stellar/stellar-sdk'
import { VarArray } from '@stellar/js-xdr'
import { NETWORK, USDC, getBalances, issuer, sac, server, submit, type Signer } from './ajo.ts'
import { signAndRelay, signAuthEntry } from './passkey.ts'

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

const ANCHOR_SAC = ANCHOR_USDC.contractId(NETWORK)
const entries = new VarArray(xdr.SorobanAuthorizationEntry as any, 0xffffffff) as any

/**
 * SEP-45: sign in a smart-contract (passkey) wallet. The anchor sends authorization entries for its web-auth
 * contract; we check they are exactly that call for this account and domain, then sign ours with the passkey.
 */
async function loginContract(me: Signer, t: any) {
  const q = new URLSearchParams({ account: me.pub, home_domain: ANCHOR_DOMAIN })
  const got = await fetch(`${t.WEB_AUTH_FOR_CONTRACTS_ENDPOINT}?${q}`).then((r) => r.json())
  const list: any[] = entries.fromXDR(Buffer.from(got.authorizationEntries ?? got.authorization_entries, 'base64'))
  const signed = await Promise.all(list.map(async (e) => {
    const fn = e.rootInvocation().function().contractFn()
    const args = scValToNative(fn.args()[0])
    if (Address.fromScAddress(fn.contractAddress()).toString() !== t.WEB_AUTH_CONTRACT_ID || fn.functionName().toString() !== 'web_auth_verify'
      || args.account !== me.pub || args.home_domain !== ANCHOR_DOMAIN || args.web_auth_domain_account !== t.SIGNING_KEY
      || e.rootInvocation().subInvocations().length) throw new Error('The anchor sent an unexpected sign-in request.')
    const c = e.credentials()
    const mine = c.switch().name === 'sorobanCredentialsAddress' && Address.fromScAddress(c.address().address()).toString() === me.pub
    return mine ? signAuthEntry(me, e) : e
  }))
  // XDR array: 4-byte big-endian count, then each entry (js-xdr's VarArray writer rejects this list).
  const count = Buffer.alloc(4); count.writeUInt32BE(signed.length)
  const body = Buffer.concat([count, ...signed.map((e: any) => e.toXDR())]).toString('base64')
  const out = await fetch(t.WEB_AUTH_FOR_CONTRACTS_ENDPOINT, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ authorization_entries: body, authorizationEntries: body }),
  }).then((r) => r.json())
  if (!out.token) throw new Error(out.error || 'The anchor did not accept the passkey sign-in.')
  return { token: out.token as string, transfer: t.TRANSFER_SERVER_SEP0024 as string }
}

/** SEP-10: prove we own the account and get a session token from the anchor. */
async function login(me: Signer) {
  const t: any = await info()
  if (me.keyId) return loginContract(me, t)
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
  if (pub.startsWith('C')) return Number((await (await sac(issuer.publicKey(), false, ANCHOR_SAC)).balance({ id: pub })).result) / 1e7
  const acc: any = await server.loadAccount(pub).catch(() => null)
  const b = acc?.balances.find((x: any) => x.asset_code === ANCHOR_USDC.code && x.asset_issuer === ANCHOR_ISSUER)
  return b ? Number(b.balance) : null // null = no trustline yet
}

/**
 * Swap the anchor's USDC 1:1 with the savings USDC that circles use, in one atomic transaction.
 * shortcut: testnet only. The demo issuer doubles as the reserve and its key is public; on mainnet both are
 * Circle's USDC, so deposits are already savings and this disappears.
 */
async function swap(me: Signer, amount: number, toSavings: boolean) {
  const amt = amount.toFixed(7)
  if ((await anchorBalance(issuer.publicKey())) === null) {
    await submit({ pub: issuer.publicKey(), secret: issuer.secret() }, [Operation.changeTrust({ asset: ANCHOR_USDC })])
  }
  if (me.keyId) {
    // A contract wallet cannot join a classic multi-op transaction, so this is two contract calls.
    // shortcut: not atomic; the reserve pays first so a failed second step never costs the user (testnet money only).
    const units = BigInt(Math.round(amount * 1e7))
    const [give, get] = toSavings ? [ANCHOR_SAC, USDC.contractId(NETWORK)] : [USDC.contractId(NETWORK), ANCHOR_SAC]
    const pay = toSavings
      ? await (await sac(issuer.publicKey(), true)).mint({ to: me.pub, amount: units })
      : await (await sac(issuer.publicKey(), true, get)).transfer({ from: issuer.publicKey(), to: me.pub, amount: units })
    await pay.signAndSend()
    return signAndRelay(me, await (await sac(issuer.publicKey(), false, give)).transfer({ from: me.pub, to: issuer.publicKey(), amount: units }))
  }
  const [give, get] = toSavings ? [ANCHOR_USDC, USDC] : [USDC, ANCHOR_USDC]
  const trustUsdc = toSavings && !(await getBalances(me.pub))?.trusted ? [Operation.changeTrust({ asset: USDC })] : []
  return submit(me, [
    ...trustUsdc,
    Operation.payment({ destination: issuer.publicKey(), asset: give, amount: amt }),
    Operation.payment({ source: issuer.publicKey(), destination: me.pub, asset: get, amount: amt }),
  ], undefined, [issuer])
}
export const moveToSavings = (me: Signer, amount: number) => swap(me, amount, true)
export const swapOut = (me: Signer, amount: number) => swap(me, amount, false)

/**
 * SEP-24: open the anchor's own KYC and bank-details form. `popup` must be opened by the click handler
 * (browsers block popups opened after an await). For a withdrawal, once the user finishes the form we
 * send the USDC to the anchor with the memo it asks for.
 */
export async function startTransfer(me: Signer, kind: 'deposit' | 'withdraw', popup: Window | null, onStatus: (s: string) => void) {
  if (!me.keyId && (await anchorBalance(me.pub)) === null) { // contract wallets need no trustline
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

  let sent = false // the anchor may still report pending_user_transfer_start on the next poll; pay only once
  for (let i = 0; i < 120; i++) { // up to ~10 minutes
    await new Promise((res) => setTimeout(res, 5000))
    const { transaction: tx } = await fetch(`${transfer}/transaction?id=${r.id}`, { headers: { Authorization: `Bearer ${token}` } }).then((x) => x.json())
    if (!tx) continue
    if (kind === 'withdraw' && tx.status === 'pending_user_transfer_start' && !sent) {
      sent = true
      const short = Number(tx.amount_in) - ((await anchorBalance(me.pub)) ?? 0)
      if (short > 0) {
        const savings = (await getBalances(me.pub))?.usdc ?? 0
        if (savings + 1e-7 < short) throw new Error(`The anchor asked for ${tx.amount_in} USDC but your savings hold ${savings.toFixed(2)}. Start the cash-out again with a smaller amount.`)
        onStatus('Moving money out of savings…'); await swap(me, short, false)
      }
      onStatus(`Sending ${tx.amount_in} USDC to the anchor…`)
      if (me.keyId) {
        // Contract wallets pay with a token transfer, which carries no memo; SEP-45 anchors match it by sender.
        const units = BigInt(Math.round(Number(tx.amount_in) * 1e7))
        await signAndRelay(me, await (await sac(issuer.publicKey(), false, ANCHOR_SAC)).transfer({ from: me.pub, to: tx.withdraw_anchor_account, amount: units }))
      } else {
        const memo = tx.withdraw_memo_type === 'id' ? Memo.id(tx.withdraw_memo) : tx.withdraw_memo_type === 'hash' ? Memo.hash(Buffer.from(tx.withdraw_memo, 'base64').toString('hex')) : Memo.text(tx.withdraw_memo)
        await submitWithMemo(me, tx.withdraw_anchor_account, tx.amount_in, memo)
      }
      onStatus('Sent. Waiting for the anchor to pay out…')
    } else if (tx.status === 'completed') {
      if (kind === 'deposit') {
        const got = (await anchorBalance(me.pub)) ?? 0
        if (got > 0) { onStatus('Moving it into your savings balance…'); await moveToSavings(me, got) }
      }
      onStatus(kind === 'deposit' ? 'Deposit received and added to your balance.' : 'Cash-out complete.')
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

