import { useEffect, useState } from 'react'
import { cleanCode, dueAt, isCode, isFull, joinCircle, nameOf, seatOrder, showCode, type Circle } from '../ajo'
import { joinProtected } from '../protected'
import { Avatar, ErrorNote, Skeleton, day, go, useAction, usdc } from '../ui'
import { useCircles, useWallet } from '../wallet'
import { saveName, savedName } from './NewCircle'

export function JoinPage({ code: raw }: { code?: string }) {
  const code = cleanCode(raw ?? '')
  return isCode(code) ? <Preview code={code} /> : <EnterCode initial={code} />
}

function EnterCode({ initial }: { initial: string }) {
  const [code, setCode] = useState(initial)
  const ok = isCode(cleanCode(code))
  return (
    <>
      <a className="back" href="#/">← Circles</a>
      <div className="page-head"><div><h1>Join a circle</h1><p className="sub">Enter the code the organiser shared with you.</p></div></div>
      <form className="card" style={{ maxWidth: 440 }} onSubmit={(e) => { e.preventDefault(); if (ok) go(`/join/${cleanCode(code)}`) }}>
        <label className="field">
          <span className="label">Circle code</span>
          <input className="input input-code" autoFocus autoComplete="off" spellCheck={false} placeholder="7KQ-2XM" maxLength={7}
            value={code} onChange={(e) => setCode(e.target.value)} />
          <span className="hint">Six letters and numbers. Dashes and spaces are fine.</span>
        </label>
        <button className="btn btn-accent btn-block" style={{ marginTop: 'var(--space-lg)' }} disabled={!ok}>Find circle</button>
      </form>
    </>
  )
}

function Preview({ code }: { code: string }) {
  const { wallet, addCode } = useWallet()
  const { circles, loading } = useCircles([code])
  const { busy, error, run } = useAction()
  const [name, setName] = useState(savedName)
  const c: Circle | null | undefined = circles[code]
  const member = !!c && c.members.includes(wallet!.pub)

  useEffect(() => { if (member) addCode(code) }, [member, code]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="stack" style={{ maxWidth: 560 }}><Skeleton h={40} /><Skeleton h={260} /></div>
  if (!c) return (
    <div className="empty" style={{ maxWidth: 560 }}>
      <h2>No circle uses code {showCode(code)}</h2>
      <p>Check the code with whoever sent it. Codes use letters and the numbers 2 to 9, never 0 or 1.</p>
      <a className="btn btn-ghost" style={{ marginTop: 'var(--space-lg)' }} href="#/join">Try another code</a>
    </div>
  )

  const seat = c.members.length + 1
  return (
    <>
      <a className="back" href="#/">← Circles</a>
      <div className="page-head">
        <div>
          <p className="small muted mono">{showCode(code)}</p>
          <h1>{c.name}</h1>
          <p className="sub">Organised by {nameOf(c, c.creator)} · {usdc(c.amount)} {c.freq} · {c.members.length} of {c.size} seats taken</p>
        </div>
      </div>
      <div className="layout">
        <div className="card">
          {member ? (
            <>
              <p className="section-title">You're in this circle</p>
              <a className="btn btn-accent" href={`#/c/${code}`}>Open circle</a>
            </>
          ) : isFull(c) ? (
            <>
              <p className="section-title">This circle is full</p>
              <p className="muted">All {c.size} seats are taken. Ask {nameOf(c, c.creator)} to start another one.</p>
            </>
          ) : (
            <form onSubmit={(e) => {
              e.preventDefault()
              run('join', async () => {
                if (!name.trim()) throw new Error('Add your name so members know who you are.')
                await (c.protected ? joinProtected(wallet!, c, name) : joinCircle(wallet!, c, name))
                saveName(name); addCode(code); go(`/c/${code}`)
              })
            }}>
              <p className="section-title">Take seat {seat} of {c.size}</p>
              <dl className="kv" style={{ marginBottom: 'var(--space-lg)' }}>
                <dt>You pay each round</dt><dd>{usdc(c.amount)}</dd>
                <dt>Your payout</dt><dd>{usdc(c.amount * (c.size - 1))} in {c.mode === 'draw' ? 'a round drawn when the circle fills' : `round ${seat}`}</dd>
                <dt>Rounds</dt><dd>{c.size}, {c.freq}</dd>
                {c.protected && <><dt>Deposit now (refunded)</dt><dd>{usdc(c.protected.deposit)}</dd></>}
              </dl>
              <label className="field">
                <span className="label">Your name</span>
                <input className="input" maxLength={20} required value={name} onChange={(e) => setName(e.target.value)} />
                <span className="hint">Shown to other members. Stored on the public ledger with your join.</span>
              </label>
              <ErrorNote>{error}</ErrorNote>
              <button className="btn btn-accent btn-block" style={{ marginTop: 'var(--space-lg)' }} disabled={!!busy} aria-busy={!!busy}>
                {busy ? 'Joining…' : `Join ${c.name}`}
              </button>
            </form>
          )}
        </div>
        <aside className="card">
          <p className="section-title">Members so far</p>
          <ul className="people">
            {c.members.map((m, i) => (
              <li className="person" key={m}>
                <Avatar name={nameOf(c, m)} />
                <div><div className="name">{nameOf(c, m)}</div><div className="sub">{c.mode === 'draw' && !isFull(c) ? `Joined #${i + 1}` : `Round ${seatOrder(c).indexOf(m) + 1}`}{c.startedAt ? ` · ${day(dueAt(c, seatOrder(c).indexOf(m)))}` : ''}</div></div>
                {m === c.creator ? <span className="pill">Organiser</span> : <span />}
              </li>
            ))}
            {Array.from({ length: c.size - c.members.length }, (_, i) => (
              <li className="person" key={'open' + i}>
                <span className="avatar" aria-hidden="true">·</span>
                <div><div className="name muted">Open seat</div><div className="sub">{c.mode === 'draw' ? 'Round drawn later' : `Round ${c.members.length + i + 1}`}</div></div>
                <span />
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </>
  )
}
