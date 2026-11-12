import { CircleView } from './pages/CircleView'
import { Home } from './pages/Home'
import { JoinPage } from './pages/Join'
import { NewCircle } from './pages/NewCircle'
import { WalletPage } from './pages/WalletPage'
import { Welcome } from './pages/Welcome'
import { savedName } from './pages/NewCircle'
import { Avatar, Mark, useRoute, usdc } from './ui'
import { useWallet } from './wallet'

export default function App() {
  const route = useRoute()
  const { wallet, balances } = useWallet()
  const [, page = '', arg] = route.split('/')

  let body
  if (!wallet) body = <Welcome route={route} />
  else if (page === 'new') body = <NewCircle />
  else if (page === 'join') body = <JoinPage code={arg} />
  else if (page === 'c' && arg) body = <CircleView code={arg} />
  else if (page === 'wallet') body = <WalletPage />
  else body = <Home />

  const here = (p: string) => (page === p ? 'page' : undefined)
  return (
    <>
      <header className="bar">
        <div className="wrap bar-in">
          <a className="brand" href="#/"><Mark /><span>ajo</span></a>
          {wallet && (
            <nav className="links" aria-label="Main">
              <a href="#/" aria-current={here('') ?? here('c')}>Circles</a>
              <a href="#/wallet" aria-current={here('wallet')}>Wallet</a>
            </nav>
          )}
          {wallet && (
            <a className="chip" href="#/wallet" aria-label="Wallet balance">
              <Avatar name={savedName() || 'Me'} />
              <span className="num">{balances ? usdc(balances.usdc) : '…'}</span>
              <span className="addr mono muted">{wallet.pub.slice(0, 4)}…{wallet.pub.slice(-4)}</span>
            </a>
          )}
        </div>
      </header>
      <main className="wrap page" id="main">{body}</main>
      <footer className="foot">
        <div className="wrap">
          <span>ajo</span>
          <span>Savings circles settled on Stellar</span>
          <span>Testnet preview: USDC here is test money</span>
        </div>
      </footer>
    </>
  )
}
