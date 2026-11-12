import { useState } from 'react'
import { ajoScore, explorerAccount, getTestUsdc, type Circle } from '../ajo'
import { CopyButton, ErrorNote, go, useAction, usdc } from '../ui'
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
          <p className="sub">{w.kind === 'freighter' ? 'Signing with Freighter.' : 'A wallet kept in this browser.'} Stellar testnet.</p>
        </div>
      </div>
      <div className="layout">
        <div>
          <section className="card">
            <p className="small muted">USDC balance</p>
            <p className="balance">{balances ? usdc(balances.usdc) : '—'}</p>
            <p className="small muted" style={{ marginTop: 'var(--space-xs)' }}>{balances ? `${balances.xlm.toFixed(2)} XLM for network fees` : 'Loading balances…'}</p>
            <div className="actions" style={{ marginTop: 'var(--space-lg)' }}>
              <button className="btn btn-accent" disabled={!!faucet.busy} aria-busy={!!faucet.busy}
                onClick={() => faucet.run('mint', async () => { await getTestUsdc(w); refreshBalances() })}>
                {faucet.busy ? 'Minting…' : 'Get 500 test USDC'}
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
              This preview counts the circles saved on this device.
            </p>
          </section>
        </div>

        <aside className="card">
          <p className="section-title">Security</p>
          {w.kind === 'freighter' ? (
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
