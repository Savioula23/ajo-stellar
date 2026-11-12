import { useEffect, useState } from 'react'
import { cleanCode, isCode, loadCircle, nameOf, type Circle } from '../ajo'
import { useWallet } from '../wallet'
import { isProtectedCode, loadProtected } from '../protected'
import { Avatar, ErrorNote, useAction, naira } from '../ui'
import { savedName } from './NewCircle'

export function Welcome({ route }: { route: string }) {
  const { createLocal, createPasskey, connectPasskey, connectFreighterWallet, importSecret } = useWallet()
  const { busy, error, run } = useAction()
  const [secret, setSecret] = useState('')
  const [invite, setInvite] = useState<Circle | null>(null)
  const code = route.startsWith('/join/') ? cleanCode(route.slice(6)) : ''

  useEffect(() => { if (isCode(code)) (isProtectedCode(code) ? loadProtected(code) : loadCircle(code)).then(setInvite, () => {}) }, [code])

  return (
    <div className="welcome">
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
        <h1>Run your ajo without a treasurer.</h1>
        <p className="lede">
          Start a savings circle, share a six-character code, and let the Stellar network keep the rules.
          Each contribution is locked for that round's recipient, so nobody can take the pot early or walk off with it.
        </p>
        <div className="actions">
          <button className="btn btn-accent" disabled={!!busy} aria-busy={busy === 'passkey'} onClick={() => run('passkey', () => createPasskey(savedName()))}>
            {busy === 'passkey' ? 'Setting up your wallet…' : 'Create wallet with passkey'}
          </button>
          <button className="btn btn-ghost" disabled={!!busy} aria-busy={busy === 'signin'} onClick={() => run('signin', connectPasskey)}>
            Sign in with passkey
          </button>
          <button className="btn btn-ghost" disabled={!!busy} aria-busy={busy === 'freighter'} onClick={() => run('freighter', connectFreighterWallet)}>
            Use Freighter
          </button>
        </div>
        <p className="small muted" style={{ marginTop: 'var(--space-sm)' }}>
          A passkey uses your phone's fingerprint, face or screen lock. No secret key to write down, and network fees are paid for you.
          Passkey wallets use protected circles.
        </p>
        <ErrorNote>{error}</ErrorNote>
        <details style={{ marginTop: 'var(--space-lg)' }}>
          <summary>I already have a secret key, or want one</summary>
          <form className="actions" onSubmit={(e) => { e.preventDefault(); run('import', () => importSecret(secret)) }}>
            <label className="sr-only" htmlFor="secret">Secret key</label>
            <input id="secret" className="input mono" style={{ flex: '1 1 260px' }} placeholder="S…" autoComplete="off" spellCheck={false}
              value={secret} onChange={(e) => setSecret(e.target.value)} />
            <button className="btn btn-ghost" disabled={!secret || !!busy} aria-busy={busy === 'import'}>Import</button>
          </form>
          <button className="linkish small" style={{ marginTop: 'var(--space-sm)' }} disabled={!!busy} onClick={() => run('local', createLocal)}>
            {busy === 'local' ? 'Setting up your wallet…' : 'Or create a wallet with a new secret key'}
          </button>
        </details>
        <p className="xs muted" style={{ marginTop: 'var(--space-lg)' }}>
          Preview on Stellar testnet. Key wallets get test XLM for fees, and the money here is test money.
        </p>
      </div>
      <ol className="steps card">
        <li><div><b>Start a circle</b><span>Set the contribution, how often it is due, and how many seats.</span></div></li>
        <li><div><b>Share the code</b><span>Friends join with the code or a link. Payout order is the order people join.</span></div></li>
        <li><div><b>Pay in, take turns</b><span>Every round, each member pays that round's recipient. Once all payments land, the recipient claims the pot.</span></div></li>
        <li><div><b>Build your Ajo Score</b><span>On-time payments raise a score anyone can check against the public ledger.</span></div></li>
      </ol>
    </div>
  )
}
