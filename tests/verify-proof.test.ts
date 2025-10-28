import { expect } from 'chai'
import * as anchor from '@coral-xyz/anchor'
import {
  loadProof,
  getProgram,
  serializeSignature,
  getNullifierProgram,
  calculateNullifier,
} from './utils'

describe('verify_proof_signatures', () => {
  const program = getProgram()
  const fixture = loadProof()
  // Prepare proof structure matching our Solana types
  const baseProof = {
    claimInfo: {
      provider: fixture.claimInfo.provider,
      // parameters: fixture.claimInfo.parameters,
      parameters: '',
      context: fixture.claimInfo.context,
    },
    signedClaim: {
      claim: {
        identifier: fixture.signedClaim.claim.identifier,
        owner: fixture.signedClaim.claim.owner,
        timestampS: fixture.signedClaim.claim.timestampS,
        epoch: fixture.signedClaim.claim.epoch,
      },
      signatures: fixture.signedClaim.signatures.map((sig) =>
        Buffer.from(serializeSignature(sig)),
      ),
    },
  }
  const provider = anchor.AnchorProvider.env()
  const payer = provider.wallet as anchor.Wallet

  let paymentConfigPda: anchor.web3.PublicKey
  let nullifierRegistryPda: anchor.web3.PublicKey

  before(async () => {
    // Find payment config PDA
    ;[paymentConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('payment_config'), payer.publicKey.toBuffer()],
      program.programId,
    )

    // Find nullifier registry PDA
    ;[nullifierRegistryPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('nullifier_registry')],
      getNullifierProgram().programId,
    )

    // Initialize nullifier registry if not exists
    try {
      await getNullifierProgram()
        .methods.initialize()
        .accounts({
          authority: payer.publicKey,
        })
        .rpc()
      console.log('✅ Nullifier registry initialized')
    } catch (e: any) {
      if (e.message && e.message.includes('already in use')) {
        console.log('✅ Nullifier registry already initialized')
      } else {
        throw e
      }
    }

    // Initialize payment config if not exists
    try {
      const recipientBankAccount = '100202642943(토스뱅크)'
      const allowedAmount = new anchor.BN(1000)
      const fiatCurrency = 'KRW'

      await program.methods
        .initialize(recipientBankAccount, allowedAmount, fiatCurrency)
        .accounts({
          authority: payer.publicKey,
        })
        .rpc()
      console.log('✅ Payment config initialized')
    } catch (e: any) {
      if (e.message && e.message.includes('already in use')) {
        console.log('✅ Payment config already initialized')
      } else {
        throw e
      }
    }
  })

  it('verifies only proof signatures (VerifyProofOnly)', async () => {
    console.log('\n=== Testing verify_proof_only (no payment validation) ===')
    const proof = baseProof
    const expectedWitnesses = [fixture.expectedWitness]

    // Required threshold (at least 1 valid signature)
    const requiredThreshold = 1
    const tx = await program.methods
      .verifyProofOnly(proof, expectedWitnesses, requiredThreshold)
      .accounts({
        signer: payer.publicKey,
      })
      .rpc()
  })

  it('verifies a complete proof (VerifyProof)', async () => {
    // Use unique context for this test to avoid nullifier collision
    const testContext = JSON.parse(baseProof.claimInfo.context)

    const proof = {
      ...baseProof,
      claimInfo: {
        ...baseProof.claimInfo,
        context: JSON.stringify(testContext),
      },
    }
    const expectedWitnesses = [fixture.expectedWitness]

    // Calculate nullifier hash from identifier (raw 32 bytes)
    const nullifierHash = calculateNullifier(proof.signedClaim.claim.identifier)

    // Find nullifier record PDA using nullifier hash bytes
    const [nullifierRecordPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('nullifier'), nullifierHash],
      getNullifierProgram().programId,
    )

    // Required threshold (at least 1 valid signature)
    const requiredThreshold = 1
    const tx = await program.methods
      .verifyProof(proof, expectedWitnesses, requiredThreshold)
      .accounts({
        signer: payer.publicKey,
        nullifierRecord: nullifierRecordPda,
      })
      .rpc()
  })

  it('rejects proof with invalid identifier', async () => {
    // Use unique context for this test to avoid nullifier collision
    const testContext = JSON.parse(baseProof.claimInfo.context)
    const invalidIdentifier = '0xdeadbeef'

    const proof = {
      ...baseProof,
      claimInfo: {
        ...baseProof.claimInfo,
        context: JSON.stringify(testContext),
      },
      signedClaim: {
        ...baseProof.signedClaim,
        claim: {
          ...baseProof.signedClaim.claim,
          identifier: invalidIdentifier,
        },
      },
    }

    const expectedWitnesses = [fixture.expectedWitness]
    const requiredThreshold = 1

    const nullifierHash = calculateNullifier(invalidIdentifier)
    const [nullifierRecordPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('nullifier'), nullifierHash],
      getNullifierProgram().programId,
    )

    try {
      await program.methods
        .verifyProof(proof, expectedWitnesses, requiredThreshold)
        .accounts({
          signer: payer.publicKey,
          paymentConfig: paymentConfigPda,
          nullifierRegistry: nullifierRegistryPda,
          nullifierRecord: nullifierRecordPda,
        })
        .rpc()

      throw new Error('Expected transaction to fail but it succeeded')
    } catch (error: any) {
      console.log('✅ Transaction correctly rejected (invalid identifier)')
      // Note: Since identifier validation is disabled,
      // invalid identifier causes signature verification to fail
      expect(error.toString()).to.include('AddressMismatch')
    }
  })

  it('rejects proof when threshold is not met', async () => {
    // Use unique context for this test to avoid nullifier collision
    const testContext = JSON.parse(fixture.claimInfo.context)

    const proof = {
      claimInfo: {
        provider: fixture.claimInfo.provider,
        // parameters: fixture.claimInfo.parameters,
        parameters: '',
        context: JSON.stringify(testContext),
      },
      signedClaim: {
        claim: {
          identifier: 'test1_' + fixture.signedClaim.claim.identifier, // Unique identifier for this test
          owner: fixture.signedClaim.claim.owner,
          timestampS: fixture.signedClaim.claim.timestampS,
          epoch: fixture.signedClaim.claim.epoch,
        },
        signatures: fixture.signedClaim.signatures.map((sig) =>
          Buffer.from(serializeSignature(sig)),
        ),
      },
    }

    // Expected witnesses - need 2 witnesses for threshold test
    // But proof only has 1 valid signature, so it should fail
    const expectedWitnesses = [fixture.expectedWitness]

    // Calculate nullifier hash from context
    const nullifierHash = calculateNullifier(proof.signedClaim.claim.identifier)

    // Find nullifier record PDA using nullifier hash bytes
    const [nullifierRecordPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('nullifier'), nullifierHash],
      getNullifierProgram().programId,
    )

    // Required threshold (at least 2 valid signatures)
    // But proof only has 1 signature, so threshold won't be met
    const requiredThreshold = 2
    try {
      await program.methods
        .verifyProof(proof, expectedWitnesses, requiredThreshold)
        .accounts({
          signer: payer.publicKey,
          paymentConfig: paymentConfigPda,
          nullifierRegistry: nullifierRegistryPda,
          nullifierRecord: nullifierRecordPda,
        })
        .rpc()

      throw new Error('Expected transaction to fail but it succeeded')
    } catch (error: any) {
      expect(error.error.errorCode.code).to.equal('InvalidThreshold')
    }
  })
})
