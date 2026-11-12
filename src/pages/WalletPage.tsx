import { useEffect, useState } from 'react'
import { ANCHOR_DOMAIN, anchorBalance, moveToSavings, startTransfer } from '../anchor'
import { ajoScore, explorerAccount, getTestUsdc, type Circle } from '../ajo'
import { CopyButton, ErrorNote, go, NGN_PER_USDC, scoreLink, useAction, naira, usdc } from '../ui'
import { useCircles, useWallet } from '../wallet'

export function WalletPage() {
  const { wallet, balances, refreshBalances, codes, signOut } = useWallet()
  const { circles } = useCircles(codes)
  const faucet = useAction()
  const [reveal, setReveal] = useState(false)
  const w = wallet!
  const list = codes.map((c) => circles[c]).filter((c): c is Circle => !!c)
  const s = ajoScore(list, w.pub)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Wallet</h1>
          <p className="sub">{w.kind === 'freighter' ? 'Signing with Freighter.' : w.kind === 'passkey' ? 'A smart wallet unlocked by your passkey.' : 'A wallet kept in this browser.'} Stellar testnet.</p>
        </div>
      </div>
      <div className="layout">
        <div>
          <section className="card">
            <p className="small muted">Savings balance</p>
            <p className="balance">{balances ? naira(balances.usdc) : '—'}</p>
            <p className="small muted" style={{ marginTop: 'var(--space-xs)' }}>{balances ? `${usdc(balances.usdc)} on Stellar at ₦${NGN_PER_USDC.toLocaleString('en-US')} per USDC · ${w.keyId ? 'network fees paid by Ajo' : `${balances.xlm.toFixed(2)} XLM for network fees`}` : 'Loading balances…'}</p>
            <div className="actions" style={{ marginTop: 'var(--space-lg)' }}>
              <button className="btn btn-accent" disabled={!!faucet.busy} aria-busy={!!faucet.busy}
                onClick={() => faucet.run('mint', async () => { await getTestUsdc(w); refreshBalances() })}>
                {faucet.busy ? 'Minting…' : `Get ${naira(500)} test money`}
              </button>
              <a className="btn btn-ghost" href={explorerAccount(w.pub)} target="_blank" rel="noreferrer">View on Stellar Expert ↗</a>
            </div>
            <ErrorNote>{faucet.error}</ErrorNote>
            <div className="divider" />
            <p className="label">Address</p>
            <div className="actions" style={{ alignItems: 'center' }}>
              <code className="mono small" style={{ overflowWrap: 'anywhere', flex: '1 1 240px' }}>{w.pub}</code>
              <CopyButton text={w.pub} label="Copy" />
            </div>
          </section>

          {w.keyId
            ? <section className="card"><h2 className="section-title">Add money or cash out</h2><p className="small muted">Bank deposits and cash-outs need a classic Stellar account today. Use a key or Freighter wallet for them; passkey support comes with a naira anchor that accepts smart wallets (SEP-45).</p></section>
            : <CashPanel />}

          <section className="card" aria-labelledby="score">
            <h2 className="section-title" id="score">Ajo Score</h2>
            <div className="score">
              <span className="big">{s.score}</span>
              <div className="facts">
                <span><b>{s.onTime}</b> on-time payments</span>
                <span><b>{s.late}</b> late</span>
                <span><b>{s.completed}</b> circles completed</span>
              </div>
            </div>
            <div className="meter" role="meter" aria-valuemin={300} aria-valuemax={850} aria-valuenow={s.score} aria-label="Ajo Score">
              <i style={{ transform: `scaleX(${(s.score - 300) / 550})` }} />
            </div>
            <p className="small muted" style={{ marginTop: 'var(--space-md)' }}>
              Starts at 500. Each on-time payment adds 25, each late payment takes 40, and each completed circle adds 20,
              kept between 300 and 850. It is calculated from public ledger records, so anyone can check it.
              Circles are found from your wallet's ledger history, so lenders can verify the same number.
            </p>
            <div className="actions" style={{ marginTop: 'var(--space-md)' }}>
              <CopyButton text={scoreLink(w.pub)} label="Copy shareable score link" />
              <a className="btn btn-ghost btn-sm" href={`#/score/${w.pub}`}>Open public record</a>
            </div>
          </section>
        </div>

        <aside className="card">
          <p className="section-title">Security</p>
          {w.kind === 'passkey' ? (
            <p className="small muted">Every payment is approved with your passkey (fingerprint, face or screen lock). There is no secret key to lose. Your passkey syncs through your phone's password manager.</p>
          ) : w.kind === 'freighter' ? (
            <p className="small muted">Every payment is approved in Freighter. Ajo never sees your secret key.</p>
          ) : (
            <>
              <p className="small muted">Your secret key exists only in this browser. Save it somewhere safe, or you lose access when browser data is cleared.</p>
              {reveal ? (
                <div className="stack" style={{ marginTop: 'var(--space-md)' }}>
                  <code className="secret">{w.secret}</code>
                  <div className="actions">
                    <CopyButton text={w.secret!} label="Copy secret key" />
                    <button className="btn btn-ghost btn-sm" onClick={() => setReveal(false)}>Hide</button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 'var(--space-md)' }} onClick={() => setReveal(true)}>Show secret key</button>
              )}
            </>
          )}
          <div className="divider" />
          <button className="linkish small" onClick={() => {
            const msg = w.kind === 'local'
              ? 'Sign out and remove this wallet from the browser? Without your saved secret key you cannot get it back.'
              : 'Disconnect Freighter from Ajo?'
            if (confirm(msg)) { signOut(); go('/') }
          }}>Sign out</button>
        </aside>
      </div>
    </>
  )
}

/** Money in and out through a Stellar anchor (SEP-10 sign-in + SEP-24 hosted KYC and bank details). */
function CashPanel() {
  const { wallet, balances, refreshBalances } = useWallet()
  const { busy, error, run } = useAction()
  const [status, setStatus] = useState('')
  const [bal, setBal] = useState<number | null>(null)
  const refresh = () => { refreshBalances(); anchorBalance(wallet!.pub).then(setBal, () => {}) }
  useEffect(() => { refresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const go = (kind: 'deposit' | 'withdraw') => {
    const popup = window.open('about:blank', 'ajo-anchor', 'width=480,height=720') // must open inside the click
    run(kind, async () => {
      try { await startTransfer(wallet!, kind, popup, setStatus) } finally { refresh() }
    })
  }

  return (
    <section className="card" aria-labelledby="cash">
      <h2 className="section-title" id="cash">Add money or cash out</h2>
      <p className="small muted">
        Bank transfers in and out go through an anchor, a licensed company that swaps naira for USDC on Stellar.
        Deposits land in your savings balance. This preview uses the Stellar Development Foundation's test anchor ({ANCHOR_DOMAIN}),
        which works in US dollars with a test KYC form and fake bank; a naira anchor replaces it at launch.
      </p>
      {!!bal && (
        <div className="actions" style={{ marginTop: 'var(--space-md)', alignItems: 'center' }}>
          <span className="small">{naira(bal)} from the anchor is not in your savings yet.</span>
          <button className="btn btn-accent btn-sm" disabled={!!busy} aria-busy={busy === 'move'}
            onClick={() => run('move', async () => { await moveToSavings(wallet!, bal); refresh() })}>Move to savings</button>
        </div>
      )}
      <div className="actions" style={{ marginTop: 'var(--space-md)' }}>
        <button className="btn btn-ghost" disabled={!!busy} aria-busy={busy === 'deposit'} onClick={() => go('deposit')}>Add money</button>
        <button className="btn btn-ghost" disabled={!!busy || !(balances?.usdc || bal)} aria-busy={busy === 'withdraw'} onClick={() => go('withdraw')}>Cash out</button>
      </div>
      {status && <p className="small" role="status" style={{ marginTop: 'var(--space-sm)' }}>{status}</p>}
      <ErrorNote>{error}</ErrorNote>
    </section>
  )
}
