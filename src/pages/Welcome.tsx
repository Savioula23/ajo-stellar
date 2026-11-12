import { useEffect, useState } from 'react'
import { cleanCode, isCode, loadCircle, nameOf, type Circle } from '../ajo'
import { useWallet } from '../wallet'
import { AJO_CONTRACT, isProtectedCode, loadProtected } from '../protected'
import { Adire, Avatar, ErrorNote, go, useAction, naira } from '../ui'
import { savedName } from './NewCircle'
import '../landing.css'

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function Welcome({ route }: { route: string }) {
  const { createLocal, createPasskey, connectPasskey, connectFreighterWallet, importSecret } = useWallet()
  const { busy, error, run } = useAction()
  const [secret, setSecret] = useState('')
  const [join, setJoin] = useState('')
  const [invite, setInvite] = useState<Circle | null>(null)
  const code = route.startsWith('/join/') ? cleanCode(route.slice(6)) : ''

  useEffect(() => { if (isCode(code)) (isProtectedCode(code) ? loadProtected(code) : loadCircle(code)).then(setInvite, () => {}) }, [code])

  const start = () => run('passkey', () => createPasskey(savedName()))
  const top = () => window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' })

  return (
    <div className="landing">
      <section className="l-hero" aria-labelledby="l-h1">
        <div>
          {invite && (
            <div className="invite-banner">
              <Avatar name={nameOf(invite, invite.creator)} />
              <div>
                <b>{nameOf(invite, invite.creator)} invited you to {invite.name}</b>
                <p className="small muted">{naira(invite.amount)} {invite.freq} · {invite.members.length} of {invite.size} seats taken. Set up a wallet to join.</p>
              </div>
            </div>
          )}
          <p className="l-eyebrow"><span className="l-dot" aria-hidden="true" /> Live on Stellar testnet</p>
          <h1 id="l-h1">The ajo nobody can run off with.</h1>
          <p className="lede">
            Rotating savings circles for Nigeria. Every contribution is locked on Stellar for that round's recipient,
            and a smart contract pays out. No collector holds the cash.
          </p>
          <div className="actions">
            <button className="btn btn-accent" disabled={!!busy} aria-busy={busy === 'passkey'} onClick={start}>
              {busy === 'passkey' ? 'Setting up your wallet…' : 'Create wallet with passkey'}
            </button>
            <button className="btn btn-ghost" disabled={!!busy} aria-busy={busy === 'signin'} onClick={() => run('signin', connectPasskey)}>
              Sign in with passkey
            </button>
          </div>
          <ErrorNote>{error}</ErrorNote>
          <form className="l-code" onSubmit={(e) => { e.preventDefault(); if (isCode(cleanCode(join))) go(`/join/${cleanCode(join)}`) }}>
            <label htmlFor="l-join" className="small muted">Got an invite code?</label>
            <span className="input-group">
              <input id="l-join" className="input mono" placeholder="122-228" maxLength={8} value={join} onChange={(e) => setJoin(e.target.value)} />
              <button className="btn btn-ghost btn-sm" disabled={!isCode(cleanCode(join))}>Open invite</button>
            </span>
          </form>
          <details className="l-more">
            <summary>I already have a secret key, or want one</summary>
            <form className="actions" onSubmit={(e) => { e.preventDefault(); run('import', () => importSecret(secret)) }}>
              <label className="sr-only" htmlFor="secret">Secret key</label>
              <input id="secret" className="input mono" style={{ flex: '1 1 260px' }} placeholder="S…" autoComplete="off" spellCheck={false}
                value={secret} onChange={(e) => setSecret(e.target.value)} />
              <button className="btn btn-ghost" disabled={!secret || !!busy} aria-busy={busy === 'import'}>Import</button>
            </form>
            <div className="actions">
              <button className="linkish small" disabled={!!busy} onClick={() => run('local', createLocal)}>
                {busy === 'local' ? 'Setting up your wallet…' : 'Or create a wallet with a new secret key'}
              </button>
              <button className="linkish small" disabled={!!busy} onClick={() => run('freighter', connectFreighterWallet)}>Use Freighter</button>
            </div>
          </details>
        </div>
        <CircleDemo />
      </section>

      <section className="l-sec" aria-labelledby="l-why">
        <h2 id="l-why">Where a paper ajo breaks, and what Ajo does instead</h2>
        <div className="l-compare">
          <p className="l-col-h muted">Paper ajo</p><p className="l-col-h">Ajo on Stellar</p>
          <Row bad="The collector holds everyone's cash and can disappear with it." good="Each payment is locked for the round's recipient. Nobody else can claim it." />
          <Row bad="One late member stalls the round for everyone." good="Members put down a refundable deposit that pays a missed share after the grace period." />
          <Row bad="Your saving record lives in one person's notebook." good="Every payment is on a public ledger and adds to an Ajo Score anyone can check." />
        </div>
      </section>

      <section className="l-sec" aria-labelledby="l-round">
        <h2 id="l-round">One round, from contribution to payout</h2>
        <div className="l-split">
          <Flow />
          <ol className="steps card">
            <li><div><b>Start a circle</b><span>Set the amount in naira, how often, and how many seats.</span></div></li>
            <li><div><b>Share a six-character code</b><span>Friends join by link, QR code or WhatsApp.</span></div></li>
            <li><div><b>Everyone pays in</b><span>The contract records each payment and who paid on time.</span></div></li>
            <li><div><b>The pot is released</b><span>Once every share lands, the recipient claims the full pot.</span></div></li>
          </ol>
        </div>
      </section>

      <section className="l-sec l-dark" aria-labelledby="l-protect">
        <div className="l-dark-in">
          <h2 id="l-protect">Protection written into a smart contract</h2>
          <div className="l-cards">
            <article className="l-card"><span className="l-tag">Deposit</span><h3>Refundable deposit</h3><p>Held by the contract and returned after the last round.</p></article>
            <article className="l-card"><span className="l-tag">Cover</span><h3>Missed payment cover</h3><p>After the grace period, anyone can pay a missing share from that member's deposit.</p></article>
            <article className="l-card"><span className="l-tag">Bid</span><h3>Early payout by bid</h3><p>Need the pot sooner? Bid for this round. The member you swap with receives your bid.</p></article>
          </div>
          <a className="l-contract mono" href={`https://stellar.expert/explorer/testnet/contract/${AJO_CONTRACT}`} target="_blank" rel="noreferrer">
            Contract {AJO_CONTRACT.slice(0, 6)}…{AJO_CONTRACT.slice(-6)} on Stellar Expert ↗
          </a>
        </div>
      </section>

      <section className="l-sec" aria-labelledby="l-naira">
        <h2 id="l-naira">A fingerprint instead of a password, and amounts in naira</h2>
        <div className="l-cards l-cards-2">
          <article className="card l-panel">
            <div className="l-prompt" aria-hidden="true">
              <svg viewBox="0 0 48 48" className="l-fp"><path d="M24 6a16 16 0 0 0-16 16v4M40 26v-4A16 16 0 0 0 19 7M24 14a8 8 0 0 0-8 8v6c0 5-2 9-4 11M32 22a8 8 0 0 0-8-8M32 22v6c0 6 2 10 4 12M24 22v8c0 6-3 11-6 13M24 30c0 5 2 9 5 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
              <b>Use your fingerprint for Ajo</b>
              <span className="small muted">ajo-stellar.vercel.app</span>
            </div>
            <h3>Passkey wallet</h3>
            <p className="muted">No secret key to write down. Network fees are paid for you, so a new member needs nothing but a phone.</p>
          </article>
          <article className="card l-panel">
            <div className="l-cash" aria-hidden="true">
              <span className="small muted">Add money</span>
              <span className="l-big num">₦30,000</span>
              <span className="l-arrow">↓ licensed anchor</span>
              <span className="num">20 USDC in your savings</span>
            </div>
            <h3>Naira in, naira out</h3>
            <p className="muted">Bank deposits and cash-outs go through a Stellar anchor. Savings sit in USDC, so they hold their value between rounds.</p>
          </article>
        </div>
      </section>

      <section className="l-sec" aria-labelledby="l-score">
        <div className="l-split">
          <div>
            <h2 id="l-score">An Ajo Score that lenders can verify</h2>
            <p className="lede">
              Every on-time payment raises your score and every late one lowers it. It is read straight from the ledger,
              so you can share a link and anyone can check it without trusting us.
            </p>
          </div>
          <div className="card l-score">
            <p className="small muted">Ajo Score</p>
            <p className="l-big num">745</p>
            <div className="meter" aria-hidden="true"><i style={{ transform: 'scaleX(0.81)' }} /></div>
            <div className="l-facts small">
              <span><b className="num">9</b> on time</span><span><b className="num">0</b> late</span><span><b className="num">2</b> circles completed</span>
            </div>
          </div>
        </div>
      </section>

      <section className="l-close" aria-labelledby="l-start">
        <div className="l-close-art" aria-hidden="true"><Adire /></div>
        <div className="l-close-in">
          <h2 id="l-start">Start your circle in under a minute</h2>
          <p>Create a wallet with your fingerprint, set the contribution, and share the code.</p>
          <button className="btn btn-accent" onClick={top}>Go to sign-up</button>
        </div>
      </section>
    </div>
  )
}

function Row({ bad, good }: { bad: string; good: string }) {
  return (<><p className="l-bad">{bad}</p><p className="l-good">{good}</p></>)
}

const MEMBERS = ['Adaeze', 'Bola', 'Chike', 'Dayo', 'Efe', 'Funmi']

/** The real circle screen, as live HTML: payments land one by one, then the payout unlocks. */
function CircleDemo() {
  const [paid, setPaid] = useState(reduced() ? 5 : 1)
  useEffect(() => {
    if (reduced()) return
    const t = setInterval(() => setPaid((n) => (n >= 6 ? 1 : n + 1)), 3000)
    return () => clearInterval(t)
  }, [])
  const landed = Math.min(paid, 5)
  const done = landed >= 5
  return (
    <div className="l-frame" aria-label="Example circle screen" role="img">
      <div className="l-frame-bar"><i /><i /><i /><span className="mono">ajo-stellar.vercel.app/#/c/122-228</span></div>
      <div className="l-frame-body">
        <div className="l-frame-head">
          <div>
            <b>Market women, Itam</b>
            <p className="small muted">₦30,000 weekly · 6 members · protected</p>
          </div>
          <span className="pill pill-accent">Round 1 of 6</span>
        </div>
        <div className="l-pot">
          <span className="small muted">Pot for Adaeze</span>
          <span className="l-big num">{naira((landed * 30000) / 1500)}</span>
          <span className="small muted">of ₦150,000</span>
        </div>
        <ul className="l-members">
          {MEMBERS.map((m, i) => {
            const state = i === 0 ? 'Receives' : i <= landed ? 'Paid' : i === landed + 1 ? 'Paying…' : 'Due Fri'
            const tone = state === 'Paid' ? 'pill-ok' : state === 'Receives' ? 'pill-accent' : state === 'Paying…' ? 'pill-warn' : ''
            return (<li key={m}><Avatar name={m} /><span>{m}</span><span className={`pill ${tone}`}>{state}</span></li>)
          })}
        </ul>
        <span className={`btn btn-block ${done ? 'btn-accent' : 'btn-ghost'}`} aria-hidden="true">
          {done ? 'Claim ₦150,000 payout' : `Waiting for ${5 - landed} payment${5 - landed === 1 ? '' : 's'}`}
        </span>
      </div>
    </div>
  )
}

/** Members → contract → recipient, with payments travelling along the lines. */
function Flow() {
  const ys = [40, 110, 180, 250]
  return (
    <svg className="l-flow" viewBox="0 0 520 290" role="img" aria-label="Four members pay into the Ajo contract, which releases the pot to the round's recipient">
      {ys.map((y) => <path key={y} id={`p${y}`} d={`M92 ${y} C 190 ${y}, 190 145, 250 145`} className="l-line" />)}
      <path id="pout" d="M330 145 L 420 145" className="l-line l-line-out" />
      {!reduced() && ys.map((y, i) => (
        <circle key={y} r="5" className="l-pulse"><animateMotion dur="3s" begin={`${i * 0.35}s`} repeatCount="indefinite"><mpath href={`#p${y}`} /></animateMotion></circle>
      ))}
      {!reduced() && <circle r="6" className="l-pulse l-pulse-out"><animateMotion dur="3s" begin="1.5s" repeatCount="indefinite"><mpath href="#pout" /></animateMotion></circle>}
      {['Bola', 'Chike', 'Dayo', 'Efe'].map((n, i) => (
        <g key={n} transform={`translate(20 ${ys[i] - 18})`}>
          <rect width="72" height="36" rx="18" className="l-node" /><text x="36" y="23" textAnchor="middle">{n}</text>
        </g>
      ))}
      <g transform="translate(250 105)"><rect width="80" height="80" rx="18" className="l-core" /><text x="40" y="38" textAnchor="middle" className="l-core-t">Ajo</text><text x="40" y="56" textAnchor="middle" className="l-core-s">contract</text></g>
      <g transform="translate(420 127)"><rect width="88" height="36" rx="18" className="l-node l-node-out" /><text x="44" y="23" textAnchor="middle">Adaeze</text></g>
    </svg>
  )
}
