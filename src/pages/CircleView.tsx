import { useEffect } from 'react'
import {
  canClaim, claimPot, dueAt, explorerAccount, explorerTx, isDone, isFull, nameOf, owes, payRound, pot, recipientOf, showCode,
  type Circle, type CircleEvent,
} from '../ajo'
import { Adire, Avatar, CopyButton, ErrorNote, Skeleton, ago, day, joinLink, until, useAction, usdc } from '../ui'
import { useCircles, useWallet } from '../wallet'

export function CircleView({ code }: { code: string }) {
  const { wallet, addCode, refreshBalances } = useWallet()
  const { circles, loading, reload } = useCircles([code], 8000)
  const c: Circle | null | undefined = circles[code]
  const me = wallet!.pub
  const member = !!c?.members.includes(me)

  useEffect(() => { if (member) addCode(code) }, [member, code]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !c) return <div className="stack"><Skeleton h={48} /><Skeleton h={120} /><Skeleton h={320} /></div>
  if (!c) return (
    <div className="empty">
      <h2>Circle not found</h2>
      <p>No circle uses code {showCode(code)}. It may not have been created yet, or the code has a typo.</p>
      <a className="btn btn-ghost" style={{ marginTop: 'var(--space-lg)' }} href="#/">Back to circles</a>
    </div>
  )

  return (
    <>
      <a className="back" href="#/">← Circles</a>
      <div className="page-head">
        <div>
          <h1>{c.name}</h1>
          <p className="sub">{usdc(c.amount)} {c.freq} · {c.size} members · pot {usdc(pot(c))}{c.startedAt ? ` · started ${day(c.startedAt)}` : ''}</p>
        </div>
      </div>
      <div className="layout">
        <div>
          <NextStep c={c} me={me} member={member} after={() => { reload(); refreshBalances() }} />
          <section className="block" aria-labelledby="rot">
            <h2 className="section-title" id="rot">Rotation</h2>
            <div className="card" style={{ paddingTop: 'var(--space-md)' }}><Schedule c={c} me={me} /></div>
          </section>
          <section className="block" aria-labelledby="act">
            <h2 className="section-title" id="act">Activity</h2>
            <div className="card"><Feed c={c} /></div>
          </section>
        </div>
        <aside>
          <InvitePass c={c} />
          <div className="card">
            <p className="section-title">{isFull(c) && !isDone(c) ? `Round ${c.round + 1}` : 'Members'}</p>
            <Members c={c} me={me} />
          </div>
          <div className="card">
            <dl className="kv">
              <dt>Contribution</dt><dd>{usdc(c.amount)}</dd>
              <dt>Frequency</dt><dd>{c.freq}</dd>
              <dt>Organiser</dt><dd>{nameOf(c, c.creator)}</dd>
              <dt>Circle account</dt><dd><a href={explorerAccount(c.account)} target="_blank" rel="noreferrer" className="mono">{c.account.slice(0, 6)}… ↗</a></dd>
            </dl>
          </div>
        </aside>
      </div>
    </>
  )
}

function NextStep({ c, me, member, after }: { c: Circle; me: string; member: boolean; after: () => void }) {
  const { wallet } = useWallet()
  const { busy, error, run } = useAction()
  const rec = recipientOf(c)
  const due = dueAt(c, c.round)
  const unpaid = c.members.filter((m) => m !== rec && !c.paid[c.round]?.includes(m))

  let tone = '', title = '', body = '', action = null as React.ReactNode
  if (!isFull(c)) {
    const left = c.size - c.members.length
    title = `Waiting for ${left} more member${left > 1 ? 's' : ''}`
    body = 'Share the code. The first round starts the moment the last seat fills, and payout order is join order.'
    action = member ? <CopyButton className="btn btn-accent" text={joinLink(c.code)} label="Copy invite link" />
      : <a className="btn btn-accent" href={`#/join/${c.code}`}>Join this circle</a>
  } else if (isDone(c)) {
    tone = 'is-quiet'; title = 'Circle complete'
    body = `All ${c.size} members received ${usdc(pot(c))}.`
    action = <a className="btn btn-ghost" href="#/new">Start another</a>
  } else if (canClaim(c, me)) {
    title = `Your ${usdc(pot(c))} is ready`
    body = `Everyone paid round ${c.round + 1}. Claim it to your wallet.`
    action = <button className="btn btn-accent" disabled={!!busy} aria-busy={!!busy}
      onClick={() => run('claim', async () => { await claimPot(wallet!, c); after() })}>{busy ? 'Claiming…' : 'Claim payout'}</button>
  } else if (owes(c, me)) {
    const late = !!due && Date.now() > due
    tone = late ? 'is-urgent' : ''
    title = `Pay ${usdc(c.amount)} to ${nameOf(c, rec!)}`
    body = `Round ${c.round + 1} of ${c.size}, ${until(due)}. It stays locked until ${nameOf(c, rec!)} claims it.`
    action = <button className="btn btn-accent" disabled={!!busy} aria-busy={!!busy}
      onClick={() => run('pay', async () => { await payRound(wallet!, c); after() })}>{busy ? 'Paying…' : `Pay ${usdc(c.amount)}`}</button>
  } else if (rec === me) {
    tone = 'is-quiet'; title = 'You receive this round'
    body = `${c.paid[c.round].length} of ${c.size - 1} paid. Still waiting on ${unpaid.map((m) => nameOf(c, m)).join(', ')}.`
  } else if (member) {
    tone = 'is-quiet'; title = `You've paid round ${c.round + 1}`
    body = unpaid.length ? `Waiting on ${unpaid.map((m) => nameOf(c, m)).join(', ')}.` : `${nameOf(c, rec!)} can claim the pot now.`
  } else {
    tone = 'is-quiet'; title = 'You are viewing this circle'
    body = 'All seats are taken.'
  }

  return (
    <div className={`callout ${tone}`}>
      <div><h2>{title}</h2><p>{body}</p></div>
      {action}
      {error && <div style={{ flexBasis: '100%' }}><ErrorNote>{error}</ErrorNote></div>}
    </div>
  )
}

function Schedule({ c, me }: { c: Circle; me: string }) {
  return (
    <table className="sched">
      <thead><tr><th>Round</th><th>Recipient</th><th className="due">Due</th><th>Status</th></tr></thead>
      <tbody>
        {Array.from({ length: c.size }, (_, r) => {
          const who = c.members[r]
          const now = isFull(c) && r === c.round
          const out = c.payouts[r]
          return (
            <tr key={r} className={now ? 'is-now' : ''} aria-current={now ? 'step' : undefined}>
              <td className="r">{String(r + 1).padStart(2, '0')}</td>
              <td className="who">{who ? nameOf(c, who) : <span className="muted">Open seat</span>}{who === me && <span className="pill pill-accent" style={{ marginLeft: 8 }}>You</span>}</td>
              <td className="due num">{day(dueAt(c, r))}</td>
              <td>
                {out ? <a className="pill pill-ok" href={explorerTx(out.hash)} target="_blank" rel="noreferrer">Paid out ↗</a>
                  : now ? <span className="pill pill-accent">{c.paid[r].length} of {c.size - 1} paid</span>
                  : <span className="pill">{isFull(c) ? 'Upcoming' : 'Not started'}</span>}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Members({ c, me }: { c: Circle; me: string }) {
  const rec = recipientOf(c)
  const due = dueAt(c, c.round)
  return (
    <ul className="people">
      {c.members.map((m, i) => {
        const paid = c.paid[c.round]?.includes(m)
        const pill = !isFull(c) ? <span className="pill">Seat {i + 1}</span>
          : isDone(c) ? <span className="pill pill-ok">Done</span>
          : m === rec ? <span className="pill pill-accent">Receives</span>
          : paid ? <span className="pill pill-ok">Paid</span>
          : due && Date.now() > due ? <span className="pill pill-danger">Late</span>
          : <span className="pill pill-warn">Owes</span>
        return (
          <li className="person" key={m}>
            <Avatar name={nameOf(c, m)} />
            <div><div className="name">{nameOf(c, m)}{m === me ? ' (you)' : ''}</div><div className="sub mono">{m.slice(0, 4)}…{m.slice(-4)}</div></div>
            {pill}
          </li>
        )
      })}
    </ul>
  )
}

function InvitePass({ c }: { c: Circle }) {
  const link = joinLink(c.code)
  const canShare = typeof navigator.share === 'function'
  return (
    <div className="pass" style={{ marginBottom: 'var(--space-md)' }}>
      <Adire />
      <p className="kicker">{isFull(c) ? 'Circle code' : `Invite code · ${c.size - c.members.length} seat${c.size - c.members.length === 1 ? '' : 's'} left`}</p>
      <p className="code">{showCode(c.code)}</p>
      <div className="actions">
        <CopyButton className="btn btn-sm" text={showCode(c.code)} label="Copy code" />
        {canShare
          ? <button className="btn btn-ghost btn-sm" onClick={() => navigator.share({ title: `Join ${c.name} on Ajo`, text: `Join "${c.name}" on Ajo with code ${showCode(c.code)}`, url: link }).catch(() => {})}>Share</button>
          : <CopyButton className="btn btn-ghost btn-sm" text={link} label="Copy link" />}
      </div>
      <p className="link">{link.replace(/^https?:\/\//, '')}</p>
    </div>
  )
}

const describe = (c: Circle, e: CircleEvent) => {
  const n = nameOf(c, e.who)
  if (e.kind === 'create') return `${n} started the circle`
  if (e.kind === 'join') return `${n} joined`
  if (e.kind === 'pay') return `${n} paid round ${e.round! + 1}${e.late ? ' (late)' : ''}`
  return `${n} received ${usdc(pot(c))}`
}

function Feed({ c }: { c: Circle }) {
  return (
    <ul className="feed">
      {c.events.map((e) => (
        <li key={e.hash}>
          <span>{describe(c, e)} <span className="muted">· {ago(e.at)}</span></span>
          <a href={explorerTx(e.hash)} target="_blank" rel="noreferrer">{e.hash.slice(0, 6)} ↗</a>
        </li>
      ))}
    </ul>
  )
}
