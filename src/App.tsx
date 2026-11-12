import { useEffect, useRef, useState } from 'react'
import { balance, claimAll, connectFreighter, contribute, createCircle, explorer, type Circle, type Member } from './ajo'

type Entry = { text: string; hash: string; who?: string }
type State = { circle: Circle; round: number; paid: string[]; log: Entry[] }
type Pt = { x: number; y: number }

const KEY = 'ajo-state'
const load = (): State | null => {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null }
}
const R = 210
const CENTER: Pt = { x: 0, y: 0 }
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const initials = (n: string) => n.trim().slice(0, 2).toUpperCase()
// Members slide around the ring so this round's recipient always sits at 12 o'clock.
const pos = (i: number, n: number, round: number): Pt => {
  const a = (((i - round) % n) / n) * 2 * Math.PI - Math.PI / 2
  return { x: Math.cos(a) * R, y: Math.sin(a) * R }
}
// shortcut: demo formula over this circle's history only; a production score would read each wallet's full on-chain record.
const score = (log: Entry[], pub: string) => Math.min(850, 500 + 40 * log.filter((l) => l.who === pub).length)

function fly(layer: SVGGElement | null, from: Pt, to: Pt, delay = 0) {
  if (!layer || reduceMotion()) return Promise.resolve()
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  c.setAttribute('r', '10')
  c.setAttribute('class', 'coin')
  layer.appendChild(c)
  const easing = getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim() || 'ease-out'
  const a = c.animate(
    [
      { transform: `translate(${from.x}px, ${from.y}px) scale(.4)`, opacity: 0 },
      { opacity: 1, offset: 0.15 },
      { transform: `translate(${to.x}px, ${to.y}px) scale(1)`, opacity: 1 },
    ],
    { duration: 900, delay, easing, fill: 'both' },
  )
  return a.finished.then(() => c.remove(), () => c.remove())
}

function Ring(p: {
  names: string[]; round: number; paid: (i: number) => boolean; you?: number
  locked: number; total: number; caption: string; fx: React.RefObject<SVGGElement | null>
}) {
  const n = p.names.length
  const circ = 2 * Math.PI * 96
  const frac = p.total ? Math.min(1, p.locked / p.total) : 0
  return (
    <svg className="ring" viewBox="-270 -270 540 540" role="img" aria-label={`Savings circle with ${n} members. ${p.caption}`}>
      <g className="spin"><circle className="orbit" r={R} /></g>
      {p.names.map((_, i) => p.paid(i) && i !== p.round % n && (
        <line key={'l' + i} className="flow" x1={pos(i, n, p.round).x} y1={pos(i, n, p.round).y} x2={0} y2={0} />
      ))}
      <circle className="pot" r={84} />
      {frac > 0 && <circle className="pot-arc" r={96} transform="rotate(-90)" strokeDasharray={`${circ * frac} ${circ}`} />}
      <text className="pot-amt" y={8}>{p.locked}</text>
      <text className="pot-sub" y={36}>{p.caption}</text>
      {p.names.map((name, i) => {
        const { x, y } = pos(i, n, p.round)
        const cls = ['node', p.paid(i) && 'is-paid', i === p.round % n && 'is-recipient'].filter(Boolean).join(' ')
        return (
          <g key={i} className={cls} style={{ transform: `translate(${x}px, ${y}px)` }}>
            <circle className="halo" r={34} />
            <circle r={34} />
            <text>{initials(name) || '?'}</text>
            <text className="label" y={54}>{name}{i === p.you ? ' · you' : ''}</text>
          </g>
        )
      })}
      <g ref={p.fx} />
    </svg>
  )
}

export default function App() {
  const [s, setS] = useState<State | null>(load)
  const [names, setNames] = useState('Ada, Bola, Chike, Dayo, Eno')
  const [amount, setAmount] = useState('10')
  const [wallet, setWallet] = useState<string>()
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [bal, setBal] = useState<Record<string, number>>({})
  const fx = useRef<SVGGElement>(null)

  const save = (next: State | null) => {
    setS(next)
    try { next ? localStorage.setItem(KEY, JSON.stringify(next)) : localStorage.removeItem(KEY) } catch { /* private mode: state lives in memory */ }
  }

  useEffect(() => {
    if (!s) return
    Promise.all(s.circle.members.map(async (m) => [m.pub, await balance(s.circle, m.pub)] as const))
      .then((e) => setBal(Object.fromEntries(e))).catch(() => {})
  }, [s])

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setErr('')
    try { await fn() } catch (e: any) {
      const codes = e?.response?.data?.extras?.result_codes
      setErr(codes ? `Stellar rejected it: ${JSON.stringify(codes)}` : e.message)
    }
    setBusy('')
  }

  const nav = (
    <nav className="nav wrap" aria-label="Main">
      <span className="mark">ajo<span>.</span></span>
      <span className="net">Stellar testnet</span>
    </nav>
  )
  const hero = (
    <header className="hero wrap">
      <p className="orient">Members → pot → one recipient, every round.</p>
      <h1>Nobody <u>holds</u> the pot.</h1>
      <p className="lede">
        Ajo is the rotating savings circle Nigerians already run, rebuilt on Stellar. Each contribution is locked on-chain
        for that round's recipient, so there is no treasurer to trust. Every payment builds an Ajo Score, a savings record you can take anywhere.
      </p>
    </header>
  )
  const foot = (
    <footer className="foot wrap">
      <p>Ajo ran on trust for generations. Now the trust lives in the ledger.</p>
      <p className="muted">Built on Stellar testnet with claimable balances and demo USDC · Boundless Build Day, Uyo</p>
    </footer>
  )

  if (!s) {
    const list = names.split(',').map((x) => x.trim()).filter(Boolean)
    const pot = (Number(amount) || 0) * Math.max(0, list.length - 1)
    return (
      <>
        {nav}{hero}
        <main className="stage wrap">
          <Ring names={list.length ? list : ['?']} round={0} paid={() => false} you={wallet ? 0 : undefined}
            locked={0} total={pot} caption={`${pot} USDC pot`} fx={fx} />
          <section className="panel" aria-labelledby="start">
            <h2 id="start">Start a circle</h2>
            <p className="muted">Each member gets a funded testnet wallet with 100 demo USDC. The first name takes the first payout.</p>
            <label htmlFor="names">Members, comma separated (3 or more)</label>
            <textarea id="names" rows={2} value={names} onChange={(e) => setNames(e.target.value)} />
            <label htmlFor="amt">Contribution per round (USDC)</label>
            <input id="amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <div className="inline">
              {wallet
                ? <span className="state ok">Freighter {wallet.slice(0, 4)}…{wallet.slice(-4)} joins as {list[0] || 'member 1'}</span>
                : <button className="btn ghost sm" disabled={!!busy} onClick={() => run('Connecting Freighter…', async () => setWallet(await connectFreighter()))}>Connect Freighter</button>}
              <span className="muted">Optional. You sign your own payments.</span>
            </div>
            <button className="btn wide" disabled={!!busy} aria-busy={busy.startsWith('Creating')} onClick={() => run('Creating wallets, trustlines and USDC on Stellar…', async () => {
              if (list.length < 3) throw new Error('Add at least 3 members.')
              if (!(Number(amount) > 0)) throw new Error('Contribution must be more than 0.')
              save({ circle: await createCircle(list, amount, wallet), round: 0, paid: [], log: [] })
            })}>{busy.startsWith('Creating') ? 'Creating circle…' : 'Create circle on Stellar'}</button>
            <p className="status" role="status">{busy}</p>
            {err && <p className="err" role="alert">{err}</p>}
          </section>
        </main>
        {foot}
      </>
    )
  }

  const { circle, round, paid, log } = s
  const n = circle.members.length
  const done = round >= n
  const recipient: Member | undefined = circle.members[round]
  const others = circle.members.filter((m) => m !== recipient)
  const ready = !done && others.every((m) => paid.includes(m.pub))
  const amt = Number(circle.amount)
  const you = circle.members.findIndex((m) => !m.secret)
  const caption = done ? 'all paid out' : `of ${amt * others.length} USDC`

  const pay = (m: Member, i: number) => run(`${m.name} is signing…`, async () => {
    const hash = await contribute(circle, m, recipient!)
    await fly(fx.current, pos(i, n, round), CENTER)
    save({ ...s, paid: [...paid, m.pub], log: [{ text: `${m.name} locked ${circle.amount} USDC for ${recipient!.name}`, hash, who: m.pub }, ...log] })
  })

  const claim = () => run(`${recipient!.name} is claiming the pot…`, async () => {
    const r = await claimAll(circle, recipient!)
    const to = pos(round, n, round)
    await Promise.all(others.map((_, k) => fly(fx.current, CENTER, to, k * 120)))
    save({ ...s, round: round + 1, paid: [], log: [{ text: `${recipient!.name} claimed ${r.total} USDC`, hash: r.hash }, ...log] })
  })

  return (
    <>
      {nav}{hero}
      <main className="stage wrap">
        <Ring names={circle.members.map((m) => m.name)} round={done ? 0 : round}
          paid={(i) => !done && paid.includes(circle.members[i].pub)} you={you >= 0 ? you : undefined}
          locked={done ? amt * (n - 1) * n : paid.length * amt} total={done ? amt * (n - 1) * n : amt * others.length}
          caption={caption} fx={fx} />
        <section className="panel" aria-labelledby="circle">
          <h2 id="circle">{done ? 'Every member got paid' : `${recipient!.name} takes ${amt * others.length} USDC`}</h2>
          <p className="muted">{done ? `${n} rounds, ${n} payouts, no treasurer.` : `Round ${round + 1} of ${n}. Paid ${paid.length} of ${others.length}.`}</p>
          <div role="list">
            {circle.members.map((m, i) => {
              const sc = score(log, m.pub)
              return (
                <div className="row" role="listitem" key={m.pub}>
                  <span className="dot" aria-hidden="true">{initials(m.name)}</span>
                  <div className="who">
                    <b>{m.name}</b>{!m.secret && <span className="tag">you</span>}
                    <div className="meta">{(bal[m.pub] ?? 0).toFixed(2)} USDC</div>
                    <div className="score" title="Ajo Score: 500 + 40 per contribution, max 850">
                      <span className="meta">Ajo Score {sc}</span>
                      <span className="bar" aria-hidden="true"><i style={{ transform: `scaleX(${(sc - 300) / 550})` }} /></span>
                    </div>
                  </div>
                  {done ? <span className="state ok">paid out</span>
                    : m === recipient ? <span className="state ok">receives</span>
                    : paid.includes(m.pub) ? <span className="state ok">paid ✓</span>
                    : <button className="btn sm" disabled={!!busy} onClick={() => pay(m, i)}>Pay {circle.amount}</button>}
                </div>
              )
            })}
          </div>
          {!done && (
            <button className="btn wide" disabled={!ready || !!busy} onClick={claim}>
              {ready ? `${recipient!.name}: claim ${amt * others.length} USDC` : `Waiting on ${others.length - paid.length} payment${others.length - paid.length === 1 ? '' : 's'}`}
            </button>
          )}
          <p className="status" role="status">{busy}</p>
          {err && <p className="err" role="alert">{err}</p>}
        </section>
      </main>
      <section className="ledger wrap" aria-labelledby="ledger">
        <h2 id="ledger">On-chain ledger</h2>
        {log.length === 0 && <p className="muted">No transactions yet. Every payment shows up here with a link to Stellar Expert.</p>}
        {log.map((l) => (
          <div className="tx" key={l.hash}>
            <span>{l.text}</span>
            <a href={explorer(l.hash)} target="_blank" rel="noreferrer">{l.hash.slice(0, 8)}… ↗</a>
          </div>
        ))}
        <div className="inline">
          <button className="btn ghost sm" onClick={() => confirm('Start over? This forgets the demo wallets.') && save(null)}>Start a new circle</button>
        </div>
      </section>
      {foot}
    </>
  )
}
