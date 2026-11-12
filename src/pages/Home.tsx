import { ajoScore, getTestUsdc, isDone, type Circle } from '../ajo'
import { statusOf } from '../status'
import { ErrorNote, Skeleton, useAction, usdc } from '../ui'
import { useCircles, useWallet } from '../wallet'

export function CircleRow({ c, me }: { c: Circle; me: string }) {
  const s = statusOf(c, me)
  return (
    <a className="circle-row" href={`#/c/${c.code}`}>
      <div>
        <h3>{c.name}</h3>
        <p className="meta">{usdc(c.amount)} {c.freq} · {c.size} members · round {Math.min(c.round + 1, c.size)} of {c.size}</p>
      </div>
      <span className={`pill pill-${s.tone}`}>{s.label}</span>
      <div className="segs" aria-hidden="true">
        {Array.from({ length: c.size }, (_, r) => (
          <span key={r} className={r < c.round ? 'done' : r === c.round && !isDone(c) && c.members.length === c.size ? 'now' : ''} />
        ))}
      </div>
    </a>
  )
}

export function Home() {
  const { wallet, codes, balances, refreshBalances } = useWallet()
  const { circles, loading, error } = useCircles(codes)
  const faucet = useAction()
  const me = wallet!.pub
  const list = codes.map((c) => circles[c]).filter((c): c is Circle => !!c)
  const ordered = [...list].sort((a, b) => Number(statusOf(b, me).needsYou) - Number(statusOf(a, me).needsYou))
  const needs = list.filter((c) => statusOf(c, me).needsYou).length
  const score = ajoScore(list, me)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Your circles</h1>
          <p className="sub">{loading && codes.length ? 'Checking the ledger…' : needs ? `${needs} circle${needs > 1 ? 's need' : ' needs'} you.` : 'You are all caught up.'}</p>
        </div>
        <div className="actions">
          <a className="btn btn-ghost" href="#/join">Join with a code</a>
          <a className="btn btn-accent" href="#/new">New circle</a>
        </div>
      </div>

      {balances && balances.usdc === 0 && (
        <div className="callout" style={{ marginBottom: 'var(--space-xl)' }}>
          <div>
            <h2>Add test USDC to get started</h2>
            <p>Contributions are paid in USDC. On testnet you can mint some for free.</p>
          </div>
          <button className="btn btn-accent" disabled={!!faucet.busy} aria-busy={!!faucet.busy}
            onClick={() => faucet.run('mint', async () => { await getTestUsdc(wallet!); refreshBalances() })}>
            Get 500 test USDC
          </button>
          <ErrorNote>{faucet.error}</ErrorNote>
        </div>
      )}

      <div className="layout">
        <section aria-label="Circles">
          <ErrorNote>{error}</ErrorNote>
          {loading && codes.length > 0 ? (
            <div className="circles">{codes.map((c) => <Skeleton key={c} h={96} />)}</div>
          ) : ordered.length ? (
            <div className="circles">{ordered.map((c) => <CircleRow key={c.code} c={c} me={me} />)}</div>
          ) : (
            <div className="empty">
              <h2>No circles yet</h2>
              <p>Start one and share its code, or ask the organiser of an existing circle for theirs.</p>
              <div className="actions" style={{ marginTop: 'var(--space-lg)' }}>
                <a className="btn btn-accent" href="#/new">Start a circle</a>
                <a className="btn btn-ghost" href="#/join">I have a code</a>
              </div>
            </div>
          )}
        </section>
        <aside className="card">
          <p className="small muted">Ajo Score</p>
          <div className="score"><span className="big">{score.score}</span></div>
          <div className="meter" role="meter" aria-valuemin={300} aria-valuemax={850} aria-valuenow={score.score} aria-label="Ajo Score">
            <i style={{ transform: `scaleX(${(score.score - 300) / 550})` }} />
          </div>
          <div className="facts" style={{ marginTop: 'var(--space-md)' }}>
            <span><b>{score.onTime}</b> on time</span>
            <span><b>{score.late}</b> late</span>
            <span><b>{score.completed}</b> circles completed</span>
          </div>
          <div className="divider" />
          <dl className="kv">
            <dt>Wallet balance</dt><dd className="num">{balances ? usdc(balances.usdc) : '—'}</dd>
          </dl>
          <a className="small" href={`#/score/${me}`} style={{ display: 'inline-block', marginTop: 'var(--space-md)' }}>View your public record</a>
        </aside>
      </div>
    </>
  )
}
