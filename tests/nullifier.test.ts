import * as anchor from '@coral-xyz/anchor'
import type { Program } from '@coral-xyz/anchor'
import { SystemProgram, Keypair } from '@solana/web3.js'
import type { NullifierRegistry } from '../target/types/nullifier_registry'
import assert from 'assert'

describe('nullifier-registry', () => {
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)

  const wallet = provider.wallet as anchor.Wallet

  const nullifierProgram = anchor.workspace
    .nullifierRegistry as Program<NullifierRegistry>

  const [nullifierRegistry] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from('nullifier_registry')],
    nullifierProgram.programId,
  )

  // Test nullifier hash: [1, 1, 1, 1, ..., 1] (32 bytes)
  const testNullifierHash = Array.from(Buffer.alloc(32, 1))

  const [nullifierRecord] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from('nullifier'), Buffer.from(testNullifierHash)],
    nullifierProgram.programId,
  )

  it('Initialize nullifier registry', async () => {
    console.log('\nNullifier Registry:', nullifierRegistry.toBase58())
    console.log('Authority (wallet):', wallet.publicKey.toBase58())

    try {
      const tx = await nullifierProgram.methods
        .initialize()
        .accountsStrict({
          registry: nullifierRegistry,
          authority: wallet.publicKey,
          user: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc()

      console.log('Registry initialized! TxID:', tx)
    } catch (error: any) {
      if (error.message && error.message.includes('already in use')) {
        console.log('✅ Nullifier registry already initialized (from previous test)')
      } else {
        throw error
      }
    }

    const registryAccount =
      await nullifierProgram.account.nullifierRegistry.fetch(nullifierRegistry)
    console.log('Registry authority:', registryAccount.authority.toBase58())
    console.log('Nullifier count:', registryAccount.nullifierCount.toString())

    assert.strictEqual(
      registryAccount.authority.toBase58(),
      wallet.publicKey.toBase58(),
      'Authority should match wallet',
    )
  })

  it('Authorized wallet can mark nullifier', async () => {
    console.log('\n=== Testing Authorized Wallet ===')

    try {
      const tx = await nullifierProgram.methods
        .markNullifier(testNullifierHash)
        .accountsStrict({
          registry: nullifierRegistry,
          nullifierRecord,
          user: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc({
          skipPreflight: true,
        })
      console.log('✅ Authorized wallet successfully marked nullifier! TxID:', tx)
    } catch (error: any) {
      if (error.message && error.message.includes('already in use')) {
        console.log('✅ Nullifier already marked (from previous test)')
      } else {
        throw error
      }
    }

    // Verify the record exists and was created correctly
    const recordAccount =
      await nullifierProgram.account.nullifierRecord.fetch(nullifierRecord)
    console.log('\nNullifier Record:')
    console.log('Hash:', Buffer.from(recordAccount.nullifierHash).toString('hex'))
    console.log('Used by:', recordAccount.usedBy.toBase58())

    assert.deepStrictEqual(
      recordAccount.nullifierHash,
      testNullifierHash,
      'Nullifier hash should match',
    )
    assert.strictEqual(
      recordAccount.usedBy.toBase58(),
      wallet.publicKey.toBase58(),
      'Used by should match payer',
    )
  })

  it('Authorized wallet can mark another nullifier', async () => {
    console.log('\n=== Testing Authorized Wallet marking another nullifier ===')
    const testNullifierHash2 = Array.from(Buffer.alloc(32, 2)) // [2, 2, 2, 2, ..., 2] (32 bytes)

    const [nullifierRecord2] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('nullifier'), Buffer.from(testNullifierHash2)],
      nullifierProgram.programId,
    )

    try {
      const tx = await nullifierProgram.methods
        .markNullifier(testNullifierHash2)
        .accountsStrict({
          registry: nullifierRegistry,
          nullifierRecord: nullifierRecord2,
          user: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc({
          skipPreflight: true,
        })
    } catch (error: any) {
      if (error.message && error.message.includes('already in use')) {
        console.log('✅ Nullifier already marked (from previous test)')
      } else {
        throw error
      }
    }

    // Verify the record exists and was created correctly
    const recordAccount =
      await nullifierProgram.account.nullifierRecord.fetch(nullifierRecord2)
    console.log('\nNullifier Record:')
    console.log('Hash:', Buffer.from(recordAccount.nullifierHash).toString('hex'))
    console.log('Used by:', recordAccount.usedBy.toBase58())

    assert.deepStrictEqual(
      recordAccount.nullifierHash,
      testNullifierHash2,
      'Nullifier hash should match',
    )
    assert.strictEqual(
      recordAccount.usedBy.toBase58(),
      wallet.publicKey.toBase58(),
      'Used by should match payer',
    )
  })

  // it('Unauthorized user cannot mark nullifier', async () => {
  //   console.log('\n=== Testing Unauthorized User ===')

  //   const unauthorizedUser = Keypair.generate()

  //   // Airdrop to unauthorized user for transaction fees
  //   const airdropSig = await provider.connection.requestAirdrop(
  //     unauthorizedUser.publicKey,
  //     2 * anchor.web3.LAMPORTS_PER_SOL,
  //   )
  //   await provider.connection.confirmTransaction(airdropSig)

  //   console.log('Unauthorized user:', unauthorizedUser.publicKey.toBase58())

  //   // Create a different nullifier for unauthorized test
  //   const unauthorizedNullifierHash = Array.from(Buffer.alloc(32, 2))
  //   const [unauthorizedNullifierRecord] = anchor.web3.PublicKey.findProgramAddressSync(
  //     [Buffer.from('nullifier'), Buffer.from(unauthorizedNullifierHash)],
  //     nullifierProgram.programId,
  //   )

  //   try {
  //     await nullifierProgram.methods
  //       .markNullifier(unauthorizedNullifierHash)
  //       .accountsStrict({
  //         registry: nullifierRegistry,
  //         nullifierRecord: unauthorizedNullifierRecord,
  //         authority: unauthorizedUser.publicKey, // Wrong authority!
  //         payer: unauthorizedUser.publicKey,
  //         systemProgram: SystemProgram.programId,
  //       })
  //       .signers([unauthorizedUser])
  //       .rpc({
  //         skipPreflight: true,
  //       })

  //     assert.fail('Should have thrown UnauthorizedCaller error')
  //   } catch (error: any) {
  //     console.log('✅ Unauthorized user correctly rejected!')
  //     const errorString = error.toString()
  //     const isUnauthorizedError =
  //       errorString.includes('UnauthorizedCaller') ||
  //       errorString.includes('6003') || // Error code for UnauthorizedCaller
  //       errorString.includes('A has_one constraint was violated')

  //     assert.ok(isUnauthorizedError, 'Should fail with UnauthorizedCaller error')
  //     console.log('Error:', errorString)
  //   }

  //   console.log('✅ Authority check working correctly!')
  // })
})
