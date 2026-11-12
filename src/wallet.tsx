import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Keypair } from '@stellar/stellar-sdk'
import { connectFreighter, discoverCodes, fundTestnet, getBalances, loadCircle, type Circle, type Signer } from './ajo'
import { discoverProtected, isProtectedCode, loadProtected } from './protected'
import { connectPasskeyWallet, createPasskeyWallet } from './passkey'

export type Wallet = Signer & { kind: 'local' | 'freighter' | 'passkey' }
type Balances = Awaited<ReturnType<typeof getBalances>>

const read = <T,>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback } catch { return fallback }
}
const write = (key: string, value: unknown) => {
  try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage blocked */ }
}
const WALLET_KEY = 'ajo-wallet-v2'
const codesKey = (pub: string) => `ajo-circles-v2:${pub}`

type Ctx = {
  wallet: Wallet | null
  balances: Balances
  refreshBalances: () => void
  createLocal: () => Promise<void>
  createPasskey: (name: string) => Promise<void>
  connectPasskey: () => Promise<void>
  connectFreighterWallet: () => Promise<void>
  importSecret: (secret: string) => Promise<void>
  signOut: () => void
  codes: string[]
  addCode: (code: string) => void
}
const WalletContext = createContext<Ctx | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<Wallet | null>(() => read(WALLET_KEY, null))
  const [balances, setBalances] = useState<Balances>(null)
  const [codes, setCodes] = useState<string[]>(() => (wallet ? read(codesKey(wallet.pub), []) : []))

  const adopt = (w: Wallet | null) => {
    write(WALLET_KEY, w)
    setWallet(w)
    setCodes(w ? read(codesKey(w.pub), []) : [])
    setBalances(null)
  }
  const refreshBalances = useCallback(() => {
    if (wallet) getBalances(wallet.pub).then(setBalances, () => {})
  }, [wallet])
  useEffect(refreshBalances, [refreshBalances])

  // Rebuild the circle list from this wallet's ledger history, so a new device sees the same circles.
  useEffect(() => {
    if (!wallet) return
    const all = Promise.all([wallet.keyId ? [] : discoverCodes(wallet.pub).catch(() => [] as string[]), discoverProtected(wallet.pub).catch(() => [] as string[])]).then(([a, b]) => [...a, ...b])
    all.then((found) => setCodes((prev) => {
      const next = [...prev, ...found.filter((c) => !prev.includes(c))]
      write(codesKey(wallet.pub), next)
      return next
    }), () => {})
  }, [wallet])

  const value: Ctx = {
    wallet, balances, refreshBalances, codes,
    async createLocal() {
      const kp = Keypair.random()
      await fundTestnet(kp.publicKey())
      adopt({ kind: 'local', pub: kp.publicKey(), secret: kp.secret() })
    },
    async createPasskey(name) { adopt({ kind: 'passkey', ...(await createPasskeyWallet(name)) }) },
    async connectPasskey() { adopt({ kind: 'passkey', ...(await connectPasskeyWallet()) }) },
    async connectFreighterWallet() {
      const pub = await connectFreighter()
      await fundTestnet(pub)
      adopt({ kind: 'freighter', pub })
    },
    async importSecret(secret) {
      let kp: Keypair
      try { kp = Keypair.fromSecret(secret.trim()) } catch { throw new Error('That is not a valid Stellar secret key (it starts with S).') }
      await fundTestnet(kp.publicKey())
      adopt({ kind: 'local', pub: kp.publicKey(), secret: kp.secret() })
    },
    signOut: () => adopt(null),
    addCode(code) {
      if (!wallet) return
      setCodes((prev) => {
        const next = [code, ...prev.filter((c) => c !== code)]
        write(codesKey(wallet.pub), next)
        return next
      })
    },
  }
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet outside WalletProvider')
  return ctx
}

/** Loads circles by code and keeps them fresh while the tab is visible, so other members' moves show up. */
export function useCircles(codes: string[], everyMs = 12000) {
  const [circles, setCircles] = useState<Record<string, Circle | null>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const key = codes.join(',')

  const reload = useCallback(async () => {
    try {
      const list = await Promise.all(codes.map(async (c) => [c, await (isProtectedCode(c) ? loadProtected(c) : loadCircle(c))] as const))
      setCircles(Object.fromEntries(list))
      setError('')
    } catch {
      setError('Could not reach the Stellar network. Retrying.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    setLoading(true)
    reload()
    const t = setInterval(() => { if (document.visibilityState === 'visible') reload() }, everyMs)
    return () => clearInterval(t)
  }, [reload, everyMs])

  return { circles, loading, error, reload }
}
