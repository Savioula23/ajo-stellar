import { useEffect, useState } from 'react'
import { bidProtected, coverProtected, payProtected, payoutProtected, refundProtected } from '../protected'
import {
  canClaim, claimPot, dueAt, explorerAccount, explorerTx, feeOf, isDone, isFull, nameOf, owes, payRound, pot, recipientOf,
  seatOrder, showCode, type Circle, type CircleEvent,
} from '../ajo'
import {
  Adire, Avatar, CopyButton, ErrorNote, Qr, Skeleton, ago, circleLink, day, joinLink, until, useAction, usdc, whatsapp,
} from '../ui'
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

  const filling = !isFull(c)
  return (
    <>
      <a className="back" href="#/">← Circles</a>
      <div className="page-head">
        <div>
          <h1>{c.name}</h1>
          <p className="sub">
            {usdc(c.amount)} {c.freq} · {c.size} members · pot {usdc(pot(c))} · {c.mode === 'draw' ? 'random draw' : 'join order'}
            {c.startedAt ? ` · started ${day(c.startedAt)}` : ''}
          </p>
        </div>
      </div>
      <div className="layout">
        <div>
          <NextStep c={c} me={me} member={member} after={() => { reload(); refreshBalances() }} />
          {filling && <div className="block"><InvitePass c={c} /></div>}
          {c.protected && <Protection c={c} me={me} member={member} after={() => { reload(); refreshBalances() }} />}
          <section className="block" aria-labelledby="rot">
            <h2 className="section-title" id="rot">Rotation</h2>
            <div className="card" style={{ paddingTop: 'var(--space-md)' }}><Schedule c={c} me={me} /></div>
          </section>
          <section className="block" aria-labelledby="act">
            <h2 className="section-title" id="act">Activity</h2>
            <div className="card">{c.protected
              ? <p className="small muted">This circle's state lives in the Ajo smart contract. <a href={`https://stellar.expert/explorer/testnet/contract/${c.account}`} target="_blank" rel="noreferrer">View the contract ↗</a></p>
              : <Feed c={c} />}</div>
          </section>
        </div>
        <aside>
          {!filling && <div style={{ marginBottom: 'var(--space-md)' }}><InvitePass c={c} /></div>}
          <div className="card">
            <p className="section-title">{isFull(c) && !isDone(c) ? `Round ${c.round + 1}` : 'Members'}</p>
            <Members c={c} me={me} />
          </div>
          <div className="card">
            <dl className="kv">
              <dt>Contribution</dt><dd>{usdc(c.amount)}</dd>
              <dt>Frequency</dt><dd>{c.freq}</dd>
              <dt>Payout order</dt><dd>{c.mode === 'draw' ? 'Random draw' : 'Join order'}</dd>
              {c.protected
                ? <><dt>Deposit</dt><dd>{usdc(c.protected.deposit)}, refunded at the end</dd></>
                : <><dt>Service fee</dt><dd>0.5% of each payout</dd></>}
              <dt>Organiser</dt><dd>{nameOf(c, c.creator)}</dd>
              <dt>{c.protected ? 'Contract' : 'Circle account'}</dt><dd><a href={c.protected ? `https://stellar.expert/explorer/testnet/contract/${c.account}` : explorerAccount(c.account)} target="_blank" rel="noreferrer" className="mono">{c.account.slice(0, 6)}… ↗</a></dd>
            </dl>
            {member && c.startedAt && !isDone(c) && (
              <button className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 'var(--space-md)' }} onClick={() => downloadIcs(c, me)}>
                Add due dates to calendar
              </button>
            )}
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
  const unpaidNames = unpaid.map((m) => nameOf(c, m)).join(', ')
  const remind = member && isFull(c) && !isDone(c) && unpaid.length > 0 && (
    <a className="btn btn-ghost" href={whatsapp(`Reminder for ${c.name}: round ${c.round + 1} is ${until(due)}. Still to pay: ${unpaidNames}. ${circleLink(c.code)}`)}
      target="_blank" rel="noreferrer">Remind on WhatsApp</a>
  )

  let tone = '', title = '', body = '', action = null as React.ReactNode
  if (!isFull(c)) {
    const left = c.size - c.members.length
    title = `Waiting for ${left} more member${left > 1 ? 's' : ''}`
    body = c.mode === 'draw'
      ? 'Share the code below. The first round starts when the last seat fills, and the payout order is drawn at that moment.'
      : 'Share the code below. The first round starts when the last seat fills, and payout order is join order.'
    action = member ? null : <a className="btn btn-accent" href={`#/join/${c.code}`}>Join this circle</a>
  } else if (isDone(c)) {
    tone = 'is-quiet'; title = 'Circle complete'
    body = `All ${c.size} members received ${usdc(pot(c))}.`
    action = <a className="btn btn-ghost" href="#/new">Start another</a>
  } else if (canClaim(c, me)) {
    const fee = c.protected ? 0 : feeOf(pot(c))
    const bid = c.protected?.bidder ? c.protected.bid : 0
    title = `Your ${usdc(pot(c))} is ready`
    body = c.protected
      ? bid ? `Everyone paid round ${c.round + 1}. ${nameOf(c, c.protected.bidder!)} bid ${usdc(bid)} to take this round, so they take the pot and you receive the bid now.` : `Everyone paid round ${c.round + 1}. The contract releases it to you.`
      : `Everyone paid round ${c.round + 1}. You receive ${usdc(pot(c) - fee)} after the ${usdc(fee)} service fee.`
    action = <button className="btn btn-accent" disabled={!!busy} aria-busy={!!busy}
      onClick={() => run('claim', async () => { await (c.protected ? payoutProtected(wallet!, c) : claimPot(wallet!, c)); after() })}>{busy ? 'Claiming…' : 'Claim payout'}</button>
  } else if (owes(c, me)) {
    const late = !!due && Date.now() > due
    tone = late ? 'is-urgent' : ''
    title = `Pay ${usdc(c.amount)} to ${nameOf(c, rec!)}`
    body = `Round ${c.round + 1} of ${c.size}, ${until(due)}. It stays locked until ${nameOf(c, rec!)} claims it.`
    action = <button className="btn btn-accent" disabled={!!busy} aria-busy={!!busy}
      onClick={() => run('pay', async () => { await (c.protected ? payProtected(wallet!, c) : payRound(wallet!, c)); after() })}>{busy ? 'Paying…' : `Pay ${usdc(c.amount)}`}</button>
  } else if (rec === me) {
    tone = 'is-quiet'; title = 'You receive this round'
    body = `${c.paid[c.round].length} of ${c.size - 1} paid. Still waiting on ${unpaidNames}.`
  } else if (member) {
    tone = 'is-quiet'; title = `You've paid round ${c.round + 1}`
    body = unpaid.length ? `Waiting on ${unpaidNames}.` : `${nameOf(c, rec!)} can claim the pot now.`
  } else {
    tone = 'is-quiet'; title = 'You are viewing this circle'
    body = 'All seats are taken.'
  }

  return (
    <div className={`callout ${tone}`}>
      <div><h2>{title}</h2><p>{body}</p></div>
      {(action || remind) && <div className="actions">{action}{remind}</div>}
      {error && <div style={{ flexBasis: '100%' }}><ErrorNote>{error}</ErrorNote></div>}
    </div>
  )
}

function Schedule({ c, me }: { c: Circle; me: string }) {
  const order = seatOrder(c)
  return (
    <table className="sched">
      <thead><tr><th>Round</th><th>Recipient</th><th className="due">Due</th><th>Status</th></tr></thead>
      <tbody>
        {Array.from({ length: c.size }, (_, r) => {
          const who = order[r]
          const now = isFull(c) && r === c.round
          const out = c.payouts[r]
          return (
            <tr key={r} className={now ? 'is-now' : ''} aria-current={now ? 'step' : undefined}>
              <td className="r">{String(r + 1).padStart(2, '0')}</td>
              <td className="who">
                {who ? nameOf(c, who) : <span className="muted">{c.mode === 'draw' ? 'Drawn when full' : 'Open seat'}</span>}
                {who === me && <span className="pill pill-accent" style={{ marginLeft: 8 }}>You</span>}
              </td>
              <td className="due num">{day(dueAt(c, r))}</td>
              <td>
                {out ? <a className="pill pill-ok" href={explorerTx(out.hash)} target="_blank" rel="noreferrer">Paid out ↗</a>
                  : r < c.round ? <span className="pill pill-ok">Paid out</span>
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
        const pill = !isFull(c) ? <span className="pill">Joined #{i + 1}</span>
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
  const left = c.size - c.members.length
  const canShare = typeof navigator.share === 'function'
  const text = `Join my ajo "${c.name}": ${usdc(c.amount)} ${c.freq}, ${c.size} members. Code ${showCode(c.code)}`
  return (
    <div className="pass">
      <Adire />
      <div className="pass-top">
        <div>
          <p className="kicker">{isFull(c) ? 'Circle code' : `Invite code · ${left} seat${left === 1 ? '' : 's'} left`}</p>
          <p className="code">{showCode(c.code)}</p>
        </div>
        <Qr text={link} label={`QR code to join ${c.name}`} />
      </div>
      <div className="share-row">
        <CopyButton className="btn btn-sm" text={showCode(c.code)} label="Copy code" />
        <a className="btn btn-ghost btn-sm" href={whatsapp(`${text}\n${link}`)} target="_blank" rel="noreferrer">WhatsApp</a>
        {canShare
          ? <button className="btn btn-ghost btn-sm" onClick={() => navigator.share({ title: `Join ${c.name} on Ajo`, text, url: link }).catch(() => {})}>Share</button>
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

/** Calendar file with every due date and payout, each with a reminder the day before. */
function downloadIcs(c: Circle, me: string) {
  const stamp = (t: number) => new Date(t).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
  const order = seatOrder(c)
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ajo//Savings circles//EN']
  for (let r = c.round; r < c.size; r++) {
    const due = dueAt(c, r)
    if (!due) continue
    const mine = order[r] === me
    lines.push(
      'BEGIN:VEVENT', `UID:${c.code}-${r}@ajo`, `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(due)}`, 'DURATION:PT30M',
      `SUMMARY:${mine ? `Your ajo payout: ${c.name}` : `Pay ${usdc(c.amount)} · ${c.name}`}`,
      `DESCRIPTION:Round ${r + 1} of ${c.size}. ${circleLink(c.code)}`,
      'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:Ajo payment due tomorrow', 'END:VALARM', 'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }))
  a.download = `ajo-${c.code}.ics`
  a.click()
  URL.revokeObjectURL(a.href)
}

/** Deposits, default cover, early-payout bids and refunds: the parts only the contract can enforce. */
function Protection({ c, me, member, after }: { c: Circle; me: string; member: boolean; after: () => void }) {
  const { wallet } = useWallet()
  const { busy, error, run } = useAction()
  const p = c.protected!
  const [bid, setBid] = useState('')
  const order = seatOrder(c)
  const due = dueAt(c, c.round)
  const coverable = isFull(c) && !isDone(c) && !!due && Date.now() > due + p.graceMs
    ? c.members.filter((m) => m !== recipientOf(c) && !c.paid[c.round].includes(m)) : []
  const canBid = member && isFull(c) && !isDone(c) && order.indexOf(me) > c.round
  const minBid = Math.max(c.amount, p.bid + 0.01)

  return (
    <section className="block" aria-labelledby="prot">
      <h2 className="section-title" id="prot">Protection</h2>
      <div className="card">
        <table className="sched">
          <thead><tr><th>Member</th><th>Deposit held</th><th className="due">On time</th><th>Late</th></tr></thead>
          <tbody>
            {c.members.map((m) => (
              <tr key={m}>
                <td className="who">{nameOf(c, m)}{m === me ? ' (you)' : ''}</td>
                <td className="num">{usdc(p.deposits[m] ?? 0)}</td>
                <td className="due num">{p.onTime[m] ?? 0}</td>
                <td className="num">{p.late[m] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {coverable.length > 0 && (
          <>
            <div className="divider" />
            <p className="small"><b>Past the grace period.</b> Anyone can pay a missing share from that member's deposit so the recipient is not left short.</p>
            <div className="actions" style={{ marginTop: 'var(--space-sm)' }}>
              {coverable.map((m) => (
                <button key={m} className="btn btn-ghost btn-sm" disabled={!!busy} aria-busy={busy === m}
                  onClick={() => run(m, async () => { await coverProtected(wallet!, c, m); after() })}>Cover {nameOf(c, m)} from deposit</button>
              ))}
            </div>
          </>
        )}

        {isFull(c) && !isDone(c) && (
          <>
            <div className="divider" />
            {p.bidder
              ? <p className="small">Highest bid for round {c.round + 1}: <b>{usdc(p.bid)}</b> by {nameOf(c, p.bidder)}. If it stands, they take this round and pay {nameOf(c, recipientOf(c)!)} the bid.</p>
              : <p className="small muted">Members with a later seat can bid to take round {c.round + 1} early. The bid goes to the member they swap with.</p>}
            {canBid && (
              <form className="actions" style={{ marginTop: 'var(--space-sm)', alignItems: 'center' }}
                onSubmit={(e) => { e.preventDefault(); run('bid', async () => { await bidProtected(wallet!, c, Number(bid)); setBid(''); after() }) }}>
                <span className="input-group" style={{ flex: '1 1 180px' }}>
                  <label className="sr-only" htmlFor="bid">Bid amount</label>
                  <input id="bid" className="input num" inputMode="decimal" placeholder={minBid.toFixed(2)} value={bid}
                    onChange={(e) => setBid(e.target.value.replace(/[^0-9.]/g, ''))} />
                  <span className="unit">USDC</span>
                </span>
                <button className="btn btn-ghost btn-sm" disabled={!bid || !!busy} aria-busy={busy === 'bid'}>Bid for early payout</button>
              </form>
            )}
          </>
        )}

        {isDone(c) && member && (p.deposits[me] ?? 0) > 0 && (
          <>
            <div className="divider" />
            <button className="btn btn-accent btn-sm" disabled={!!busy} aria-busy={busy === 'refund'}
              onClick={() => run('refund', async () => { await refundProtected(wallet!, c); after() })}>
              Get my {usdc(p.deposits[me])} deposit back
            </button>
          </>
        )}
        <ErrorNote>{error}</ErrorNote>
      </div>
    </section>
  )
}
