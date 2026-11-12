// Passkey smart wallets (passkey-kit): Face ID / fingerprint instead of a secret key, fees paid by our relayer.
// The wallet is a Soroban contract (C… address), so it works with protected circles, not classic-account features.
import { rpc, scValToNative } from '@stellar/stellar-sdk'
import { NETWORK } from './ajo.ts'

const RPC_URL = 'https://soroban-testnet.stellar.org'
const WALLET_WASM = '97ce047884106b1c6c3bb40b8973cc48db1c4dad95c9e20462bf2c701daa764e' // canonical passkey-kit wallet, already on testnet

let kitP: Promise<any> | null = null
const kit = () => (kitP ??= Promise.all([import('passkey-kit'), import('passkey-kit/storage')]).then(
  ([{ PasskeyKit }, { LocalStorageAdapter }]) => new PasskeyKit({ rpcUrl: RPC_URL, networkPassphrase: NETWORK, walletWasmHash: WALLET_WASM, storage: new LocalStorageAdapter() }),
))

/** Send a signed transaction to /api/relay; returns the transaction hash. */
async function relay(xdr: string) {
  const r = await fetch('/api/relay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ xdr }) })
  const out = await r.json().catch(() => ({ error: `Relay failed (${r.status}).` }))
  if (!r.ok || !out.hash) throw new Error(out.error || 'The fee sponsor did not accept the transaction.')
  return out.hash as string
}

export async function createPasskeyWallet(name: string) {
  const k = await kit()
  const created = await k.createWallet('Ajo', name || 'Ajo member')
  const hash = await relay(created.signedTx)
  await k.confirmWalletCreation(created, hash)
  const c = await k.connectWallet({ keyId: created.keyIdBase64 })
  return { pub: c.contractId as string, keyId: c.keyIdBase64 as string }
}

/** Sign in on a device that already has the passkey: the browser asks which passkey to use. */
export async function connectPasskeyWallet() {
  const c = await (await kit()).connectWallet()
  return { pub: c.contractId as string, keyId: c.keyIdBase64 as string }
}

/** Sign an assembled contract call with the passkey, relay it, and return the call's result. */
export async function signAndRelay(me: { pub: string; keyId?: string }, tx: any) {
  const k = await kit()
  if (k.contractId !== me.pub) await k.connectWallet({ keyId: me.keyId })
  await k.sign(tx)
  const hash = await relay(tx.toXDR())
  const server = new rpc.Server(RPC_URL)
  for (let i = 0; i < 30; i++) {
    const t = await server.getTransaction(hash)
    if (t.status === 'SUCCESS') return t.returnValue ? scValToNative(t.returnValue) : undefined
    if (t.status === 'FAILED') throw new Error('The transaction failed on the network.')
    await new Promise((r) => setTimeout(r, 1000))
  }
  return undefined
}
