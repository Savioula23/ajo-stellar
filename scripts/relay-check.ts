// The relay must only pay for Ajo calls: `node --experimental-strip-types scripts/relay-check.ts`
import assert from 'node:assert'
import { Account, Asset, Keypair, Networks, Operation, TransactionBuilder, nativeToScVal } from '@stellar/stellar-sdk'
import { checkAllowed } from '../api/relay.ts'
const src = new Account(Keypair.random().publicKey(), '1')
const call = (contract: string) => new TransactionBuilder(src, { fee: '100', networkPassphrase: Networks.TESTNET })
  .addOperation(Operation.invokeContractFunction({ contract, function: 'count', args: [nativeToScVal(1, { type: 'u32' })] }))
  .setTimeout(30).build().toXDR()
assert.doesNotThrow(() => checkAllowed(call('CD3DQJD4NVU2OHGM4LTRUMJAH6XK2LFGGE3ZRZTRUH7XJ37VZ4K36BFT')))
assert.throws(() => checkAllowed(call('CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC')), /not relayed/) // native XLM contract
const payment = new TransactionBuilder(src, { fee: '100', networkPassphrase: Networks.TESTNET })
  .addOperation(Operation.payment({ destination: src.accountId(), asset: Asset.native(), amount: '1' })).setTimeout(30).build().toXDR()
assert.throws(() => checkAllowed(payment), /single contract calls/)
console.log('OK: relay allows the Ajo contract and refuses other contracts and plain payments')
