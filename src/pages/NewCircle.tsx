import { useState } from 'react'
import { createCircle, feeOf, PERIOD_MS, type Freq, type OrderMode } from '../ajo'
import { ErrorNote, go, useAction, usdc } from '../ui'
import { useWallet } from '../wallet'

const FREQS: Freq[] = ['daily', 'weekly', 'monthly']
const unit: Record<Freq, string> = { daily: 'day', weekly: 'week', monthly: 'month' }
export const savedName = () => { try { return localStorage.getItem('ajo-name') || '' } catch { return '' } }
export const saveName = (n: string) => { try { localStorage.setItem('ajo-name', n.trim()) } catch { /* storage blocked */ } }

export function NewCircle() {
  const { wallet, addCode } = useWallet()
  const { busy, error, run } = useAction()
  const [name, setName] = useState('')
  const [you, setYou] = useState(savedName)
  const [amount, setAmount] = useState('20')
  const [size, setSize] = useState(5)
  const [freq, setFreq] = useState<Freq>('weekly')
  const [mode, setMode] = useState<OrderMode>('join')
  const amt = Number(amount) || 0
  const days = Math.round((PERIOD_MS[freq] * size) / 864e5)

  const submit = () => run('create', async () => {
    const code = await createCircle(wallet!, { name, you, amount: amt, size, freq, mode })
    saveName(you)
    addCode(code)
    go(`/c/${code}`)
  })

  return (
    <>
      <a className="back" href="#/">← Circles</a>
      <div className="page-head">
        <div>
          <h1>New circle</h1>
          <p className="sub">You'll get a code to share. The circle starts once every seat is taken.</p>
        </div>
      </div>
      <div className="layout">
        <form className="card" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <label className="field">
            <span className="label">Circle name</span>
            <input className="input" maxLength={40} required placeholder="Market women, Itam" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Your name</span>
            <input className="input" maxLength={20} required autoComplete="given-name" value={you} onChange={(e) => setYou(e.target.value)} />
            <span className="hint">Members see this next to your payments.</span>
          </label>
          <label className="field">
            <span className="label">Contribution per round</span>
            <span className="input-group">
              <input className="input num" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
              <span className="unit">USDC</span>
            </span>
          </label>
          <div className="field">
            <span className="label" id="freq">How often</span>
            <div className="seg" role="radiogroup" aria-labelledby="freq">
              {FREQS.map((f) => (
                <label key={f}>
                  <input type="radio" name="freq" value={f} checked={freq === f} onChange={() => setFreq(f)} />
                  <span>{f[0].toUpperCase() + f.slice(1)}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="label" id="order">Payout order</span>
            <div className="seg" role="radiogroup" aria-labelledby="order">
              {([['join', 'Join order'], ['draw', 'Random draw']] as const).map(([v, l]) => (
                <label key={v}>
                  <input type="radio" name="order" value={v} checked={mode === v} onChange={() => setMode(v)} />
                  <span>{l}</span>
                </label>
              ))}
            </div>
            <span className="hint">{mode === 'draw'
              ? 'Drawn from the ledger when the last seat fills. Anyone can re-check the draw.'
              : 'First to join is paid first. You, as organiser, take round 1.'}</span>
          </div>
          <label className="field">
            <span className="label">Members, including you</span>
            <select className="input" value={size} onChange={(e) => setSize(Number(e.target.value))}>
              {Array.from({ length: 10 }, (_, i) => i + 3).map((n) => <option key={n} value={n}>{n} members</option>)}
            </select>
          </label>
          <ErrorNote>{error}</ErrorNote>
          <button className="btn btn-accent btn-block" style={{ marginTop: 'var(--space-lg)' }} disabled={!!busy} aria-busy={!!busy}>
            {busy ? 'Creating on Stellar…' : 'Create circle'}
          </button>
        </form>

        <aside className="card">
          <p className="section-title">How this circle runs</p>
          <dl className="kv">
            <dt>Each round you pay</dt><dd>{usdc(amt)}</dd>
            <dt>Pot each round</dt><dd>{usdc(amt * (size - 1))}</dd>
            <dt>Rounds</dt><dd>{size}, one per {unit[freq]}</dd>
            <dt>Full cycle</dt><dd>about {days} days</dd>
            <dt>You pay in total</dt><dd>{usdc(amt * (size - 1))}</dd>
            <dt>You receive</dt><dd>{usdc(amt * (size - 1) - feeOf(amt * (size - 1)))}, once</dd>
            <dt>Service fee</dt><dd>0.5% of your payout</dd>
          </dl>
          <div className="divider" />
          <p className="small muted">
            {mode === 'draw' ? 'Payout order is drawn when the circle fills.' : 'Payout order follows join order, and as the organiser you take round 1.'} Creating the circle sets up its
            own Stellar account (about 5 test XLM for the network reserve). The code then finds that account, but nobody can control it with the code.
          </p>
        </aside>
      </div>
    </>
  )
}
