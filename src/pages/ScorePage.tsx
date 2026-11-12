import { useEffect, useState } from 'react'
import { StrKey } from '@stellar/stellar-sdk'
import { ajoScore, discoverCodes, explorerAccount, isDone, nameOf, type Circle } from '../ajo'
import { discoverProtected } from '../protected'
import { CopyButton, ErrorNote, Skeleton, scoreLink, short, naira } from '../ui'
import { useCircles } from '../wallet'

/** Public, verifiable score: circles are discovered from the wallet's own ledger history, so none can be hidden. */
export function ScorePage({ pub }: { pub: string }) {
  const valid = StrKey.isValidEd25519PublicKey(pub)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (valid) Promise.all([discoverCodes(pub), discoverProtected(pub).catch(() => [] as string[])])
      .then(([a, b]) => setCodes([...a, ...b]), () => setError('Could not reach the Stellar network.'))
  }, [pub, valid])
  const { circles, loading } = useCircles(codes ?? [], 60000)

  if (!valid) return <div className="empty"><h2>That is not a Stellar address</h2><p>Score links end in an address that starts with G.</p></div>
  const list = (codes ?? []).map((c) => circles[c]).filter((c): c is Circle => !!c)
  const s = ajoScore(list, pub)
  const name = list.map((c) => c.names[pub]).find(Boolean)
  const busy = codes === null || (loading && codes.length > 0)

  return (
    <>
      <div className="page-head">
        <div>
          <p className="small muted">Ajo Score</p>
          <h1>{name ? `${name}'s savings record` : 'Savings record'}</h1>
          <p className="sub mono small"><a href={explorerAccount(pub)} target="_blank" rel="noreferrer">{short(pub)} ↗</a></p>
        </div>
        <CopyButton className="btn btn-ghost" text={scoreLink(pub)} label="Copy link to this record" />
      </div>
      <ErrorNote>{error}</ErrorNote>
      <div className="layout">
        <div>
          <section className="card">
            {busy ? <Skeleton h={120} /> : (
              <>
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
              </>
            )}
          </section>
          <section className="block" aria-labelledby="circles">
            <h2 className="section-title" id="circles">Circles on record</h2>
            {busy ? <Skeleton h={160} /> : list.length === 0 ? (
              <div className="empty"><h2>No circles yet</h2><p>This wallet has not joined any Ajo circle on the ledger.</p></div>
            ) : (
              <div className="card">
                <table className="sched">
                  <thead><tr><th>Circle</th><th>Contribution</th><th className="due">Payments</th><th>Status</th></tr></thead>
                  <tbody>
                    {list.map((c) => {
                      const mine = c.events.filter((e) => e.kind === 'pay' && e.who === pub)
                      const late = mine.filter((e) => e.late).length
                      return (
                        <tr key={c.code}>
                          <td className="who">{c.name}<div className="muted xs">organised by {nameOf(c, c.creator)}</div></td>
                          <td className="num">{naira(c.amount)}</td>
                          <td className="due num">{mine.length - late} on time{late ? `, ${late} late` : ''}</td>
                          <td><span className={`pill ${isDone(c) ? 'pill-ok' : ''}`}>{isDone(c) ? 'Completed' : `Round ${c.round + 1} of ${c.size}`}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
        <aside className="card">
          <p className="section-title">How to verify this</p>
          <p className="small muted">
            Every circle above was found from this wallet's own ledger history and from the Ajo contract's records, so circles cannot be left out.
            Each payment is checked against the round's due date. The score starts at 500: +25 per on-time payment,
            −40 per late payment, +20 per completed circle, kept between 300 and 850.
          </p>
        </aside>
      </div>
    </>
  )
}
