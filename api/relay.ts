// Vercel function: submits passkey-wallet transactions through OpenZeppelin Channels, which pays the fees.
// The API key stays on the server. Only calls to the Ajo contract, the savings-USDC contract and passkey-wallet
// deployments are forwarded, so the key cannot be used to pay for anything else.
import { Networks, StrKey, TransactionBuilder, xdr } from '@stellar/stellar-sdk'
import { PasskeyServer } from 'passkey-kit/server'

const NETWORK = Networks.TESTNET
const AJO_CONTRACT = process.env.VITE_AJO_CONTRACT || 'CD3DQJD4NVU2OHGM4LTRUMJAH6XK2LFGGE3ZRZTRUH7XJ37VZ4K36BFT'
const USDC_SAC = process.env.VITE_USDC_SAC || 'CDUOS2DVLQUE5RHAYH77PE7H5TVESRXVWSDIKSEL3U3XD25GRKNTHMLQ'
export const WALLET_WASM = '97ce047884106b1c6c3bb40b8973cc48db1c4dad95c9e20462bf2c701daa764e'

/** Throws unless the transaction is exactly one allowed host-function call. */
export function checkAllowed(txXdr: string) {
  const tx = TransactionBuilder.fromXDR(txXdr, NETWORK)
  const ops = 'operations' in tx ? tx.operations : []
  if (ops.length !== 1 || ops[0].type !== 'invokeHostFunction') throw new Error('Only single contract calls are relayed.')
  const fn = (ops[0] as any).func as xdr.HostFunction
  switch (fn.switch().name) {
    case 'hostFunctionTypeInvokeContract': {
      const to = StrKey.encodeContract(fn.invokeContract().contractAddress().contractId() as any)
      if (to !== AJO_CONTRACT && to !== USDC_SAC) throw new Error('That contract is not relayed.')
      return
    }
    case 'hostFunctionTypeCreateContractV2': {
      const exe = fn.createContractV2().executable()
      if (exe.switch().name !== 'contractExecutableWasm' || exe.wasmHash().toString('hex') !== WALLET_WASM) throw new Error('Only passkey wallets can be deployed.')
      return
    }
    default: throw new Error('That call is not relayed.')
  }
}

export async function relay(txXdr: string, apiKey: string | undefined) {
  if (!apiKey) return { status: 500, body: { error: 'CHANNELS_API_KEY is not set on the server.' } }
  try { checkAllowed(txXdr) } catch (e: any) { return { status: 400, body: { error: e.message } } }
  const server = new PasskeyServer({
    networkPassphrase: NETWORK, rpcUrl: 'https://soroban-testnet.stellar.org',
    relayer: { baseUrl: process.env.CHANNELS_URL || 'https://channels.openzeppelin.com/testnet', apiKey },
  })
  const r = await server.send(txXdr)
  return r.success ? { status: 200, body: { hash: r.hash } } : { status: 502, body: { error: r.error.message, hash: r.hash } }
}

// shortcut: no per-user rate limit; add one (e.g. Vercel KV counter per IP) before a public launch.
export async function POST(req: Request) {
  const { xdr: txXdr } = (await req.json().catch(() => ({}))) as { xdr?: unknown }
  if (typeof txXdr !== 'string' || txXdr.length > 20_000) return Response.json({ error: 'Send { xdr }.' }, { status: 400 })
  const r = await relay(txXdr, process.env.CHANNELS_API_KEY)
  return Response.json(r.body, { status: r.status })
}
