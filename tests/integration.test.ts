import { expect } from 'chai'
import * as anchor from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
} from '@solana/spl-token'
import {
  Keypair,
  SystemProgram,
  ComputeBudgetProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from '@solana/web3.js'
import {
  getProgram,
  getSplNftProgram,
  getNullifierProgram,
  loadProof,
  serializeSignature,
  calculateNullifier,
} from './utils'
// Note: We'll parse metadata manually instead of using deserializeMetadata
// to avoid UMI compatibility issues

describe('Integration Test - ZK Proof Verification and NFT Mint', () => {
  const zkEscrowSolProgram = getProgram()
  const splNftProgram = getSplNftProgram()
  const provider = anchor.AnchorProvider.env()
  const connection = provider.connection
  const payer = provider.wallet as anchor.Wallet

  // User who will verify the proof and receive the NFT
  const user = Keypair.generate()

  // Sponsor who will pay for the minting transaction
  const sponsor = payer

  const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey(
    'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
  )

  let paymentConfigPda: anchor.web3.PublicKey
  let mintAuthority: anchor.web3.PublicKey
  let collectionKeypair: Keypair
  let collectionMint: anchor.web3.PublicKey
  let collectionState: anchor.web3.PublicKey
  let collectionMetadata: anchor.web3.PublicKey
  let collectionMasterEdition: anchor.web3.PublicKey
  let collectionDestination: anchor.web3.PublicKey

  // For verification result PDA
  let verificationResultPda: anchor.web3.PublicKey

  // For NFT mint test
  let mintKeypair: Keypair
  let mint: anchor.web3.PublicKey
  let metadata: anchor.web3.PublicKey
  let masterEdition: anchor.web3.PublicKey
  let destination: anchor.web3.PublicKey

  const getMetadata = async (
    mint: anchor.web3.PublicKey,
  ): Promise<anchor.web3.PublicKey> => {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID,
    )[0]
  }

  const getMasterEdition = async (
    mint: anchor.web3.PublicKey,
  ): Promise<anchor.web3.PublicKey> => {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
        Buffer.from('edition'),
      ],
      TOKEN_METADATA_PROGRAM_ID,
    )[0]
  }

  before(async () => {
    console.log('\n=== Setup: Creating NFT Collection ===')

    // Fund the user account for transaction fees
    console.log('\nFunding user account...')
    console.log('User:', user.publicKey.toBase58())
    const airdropSig = await connection.requestAirdrop(
      user.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL,
    )
    await connection.confirmTransaction(airdropSig)
    console.log('✅ User funded with 2 SOL')

    // Find mint authority PDA
    mintAuthority = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('authority')],
      splNftProgram.programId,
    )[0]
    console.log('Mint Authority:', mintAuthority.toBase58())

    // Find payment config PDA
    ;[paymentConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('payment_config')],
      zkEscrowSolProgram.programId,
    )
    console.log('Payment Config PDA:', paymentConfigPda.toBase58())

    // Generate collection mint keypair
    collectionKeypair = Keypair.generate()
    collectionMint = collectionKeypair.publicKey
    console.log('Collection Mint:', collectionMint.toBase58())

    // Find collection state PDA
    ;[collectionState] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('collection_state'), collectionMint.toBuffer()],
      splNftProgram.programId,
    )
    console.log('Collection State:', collectionState.toBase58())

    // Get collection metadata and master edition
    collectionMetadata = await getMetadata(collectionMint)
    console.log('Collection Metadata:', collectionMetadata.toBase58())

    collectionMasterEdition = await getMasterEdition(collectionMint)
    console.log(
      'Collection Master Edition:',
      collectionMasterEdition.toBase58(),
    )

    // Get collection destination (ATA)
    collectionDestination = getAssociatedTokenAddressSync(
      collectionMint,
      payer.publicKey,
    )
    console.log('Collection Destination ATA:', collectionDestination.toBase58())

    // Create collection NFT
    const createCollectionTx = await splNftProgram.methods
      .createCollection(
        'KCONA_MOVIE1', // name
        'KMOVIE1', // symbol
        'https://kcona.io/movie/_collection.json', // collection uri
        'https://kcona.io/movie/json', // uri prefix
        new anchor.BN(1000), // price (1000 KRW)
      )
      .accounts({
        user: payer.publicKey,
        mint: collectionMint,
        metadata: collectionMetadata,
        masterEdition: collectionMasterEdition,
      })
      .signers([collectionKeypair])
      .rpc({
        skipPreflight: false,
      })
    console.log('✅ Collection NFT created, tx:', createCollectionTx)

    // Verify collection state
    const collectionStateAccount =
      await splNftProgram.account.collectionState.fetch(collectionState)
    console.log('Collection State:')
    console.log('  - Name:', collectionStateAccount.name)
    console.log('  - Symbol:', collectionStateAccount.symbol)
    console.log('  - URI Prefix:', collectionStateAccount.uriPrefix)
    console.log('  - Price:', collectionStateAccount.price.toString(), 'KRW')
    console.log('  - Counter:', collectionStateAccount.counter.toString())
  })

  it('Step 1: Initialize payment config in verification program', async () => {
    console.log('\n=== Test: Initialize Payment Config ===')

    const recipientBankAccount = '100202642943(토스뱅크)'
    const allowedAmount = new anchor.BN(1000) // 1000 KRW (matches proof.json: "-1000")
    const fiatCurrency = 'KRW'

    const tx = await zkEscrowSolProgram.methods
      .initialize(recipientBankAccount, allowedAmount, fiatCurrency)
      .accounts({
        authority: payer.publicKey,
      })
      .rpc()

    console.log('Payment config initialized, tx:', tx)

    // Verify payment config
    const paymentConfig = await zkEscrowSolProgram.account.paymentConfig.fetch(
      paymentConfigPda,
    )

    expect(paymentConfig.recipientBankAccount).to.equal(recipientBankAccount)
    expect(paymentConfig.allowedAmount.toString()).to.equal(
      allowedAmount.toString(),
    )
    expect(paymentConfig.fiatCurrency).to.equal(fiatCurrency)
    expect(paymentConfig.authority.toBase58()).to.equal(
      payer.publicKey.toBase58(),
    )

    console.log('✅ Payment config verified:')
    console.log('  - Recipient:', paymentConfig.recipientBankAccount)
    console.log('  - Amount:', paymentConfig.allowedAmount.toString(), 'KRW')
    console.log('  - Currency:', paymentConfig.fiatCurrency)
  })

  it('Step 2a: User verifies proof (Transaction 1/2)', async () => {
    console.log('\n=== Test: Verify Proof (Transaction 1) ===')

    const fixture = loadProof()

    // Use unique context for this test to avoid nullifier collision
    const testContext = JSON.parse(fixture.claimInfo.context)

    // Prepare proof structure
    const proof = {
      claimInfo: {
        provider: fixture.claimInfo.provider,
        parameters: fixture.claimInfo.parameters,
        context: JSON.stringify(testContext),
      },
      signedClaim: {
        claim: {
          identifier: fixture.signedClaim.claim.identifier, // Use original identifier (signatures are valid for this)
          owner: fixture.signedClaim.claim.owner,
          timestampS: fixture.signedClaim.claim.timestampS,
          epoch: fixture.signedClaim.claim.epoch,
        },
        signatures: fixture.signedClaim.signatures.map((sig) =>
          Buffer.from(serializeSignature(sig)),
        ),
      },
    }

    const expectedWitnesses = [fixture.expectedWitness]
    const requiredThreshold = 1

    // Find verification result PDA (derived from user, not sponsor)
    ;[verificationResultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('verification'), user.publicKey.toBuffer()],
      zkEscrowSolProgram.programId,
    )
    console.log('Verification Result PDA:', verificationResultPda.toBase58())

    // Transaction 1: User verifies proof and pays for verification
    console.log('\n👤 User signs and pays for proof verification')
    try {
      const tx = await zkEscrowSolProgram.methods
        .verifyProof(proof, expectedWitnesses, requiredThreshold)
        .accounts({
          signer: user.publicKey,
        })
        .signers([user])
        .rpc({
          skipPreflight: true,
        })

      console.log('✅ Proof verified, tx:', tx)
    } catch (error: any) {
      console.error('❌ Proof verification failed!')
      console.error('Error:', error)
      console.error('Error message:', error.message)
      console.error('Error logs:', error.logs)
      if (error.error) {
        console.error('Error code:', error.error.errorCode)
        console.error('Error name:', error.error.errorMessage)
      }
      throw error
    }

    // Verify verification result PDA was created
    const verificationResult =
      await zkEscrowSolProgram.account.verificationResult.fetch(
        verificationResultPda,
      )

    expect(verificationResult.user.toBase58()).to.equal(
      user.publicKey.toBase58(),
    )
    expect(verificationResult.isUsed).to.be.false
    expect(verificationResult.claimIdentifier).to.equal(
      fixture.signedClaim.claim.identifier, // Original identifier used in the proof
    )

    console.log('Verification Result:')
    console.log('  - PDA:', verificationResultPda.toBase58())
    console.log('  - User:', verificationResult.user.toBase58())
    console.log('  - Verified At:', verificationResult.verifiedAt.toString())
    console.log('  - Claim ID:', verificationResult.claimIdentifier)
    console.log('  - Is Used:', verificationResult.isUsed)

    // Wait a bit for account to be fully created
    await new Promise((resolve) => setTimeout(resolve, 1000))
  })

  it('Step 2b: User mints NFT with verified proof (Transaction 2/2)', async () => {
    console.log('\n=== Test: Mint NFT with Verified Proof (Transaction 2) ===')

    // Generate new NFT mint keypair
    mintKeypair = Keypair.generate()
    mint = mintKeypair.publicKey
    console.log('NFT Mint:', mint.toBase58())

    // Get NFT metadata and master edition
    metadata = await getMetadata(mint)
    console.log('NFT Metadata:', metadata.toBase58())

    masterEdition = await getMasterEdition(mint)
    console.log('NFT Master Edition:', masterEdition.toBase58())

    // Get NFT destination (ATA) - will be auto-derived from verification_result.user
    destination = getAssociatedTokenAddressSync(mint, user.publicKey)
    console.log('NFT Destination ATA (user):', destination.toBase58())

    // Compute budget instruction (needed for verify_collection CPI)
    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: 400_000, // Increased limit for mint + verify
    })

    // Transaction 2: Sponsor pays for minting, but NFT goes to user
    console.log('\n💰 Sponsor signs and pays for NFT minting')
    console.log('   → NFT will be sent to user:', user.publicKey.toBase58())
    const tx = await zkEscrowSolProgram.methods
      .mintWithVerifiedProof()
      .accounts({
        signer: sponsor.publicKey,  // Sponsor pays
        verificationResult: verificationResultPda,  // Contains user pubkey
        nftRecipient: user.publicKey,  // Verified user who receives NFT
        mint: mint,
        destination: destination,  // ATA for verified user
        metadata: metadata,
        masterEdition: masterEdition,
        mintAuthority: mintAuthority,
        collectionMint: collectionMint,
        collectionMetadata: collectionMetadata,
        collectionMasterEdition: collectionMasterEdition,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      })
      .preInstructions([computeBudgetIx])
      .signers([mintKeypair])
      .rpc({
        skipPreflight: true,
      })

    console.log('✅ NFT minted, tx:', tx)
    console.log('   ✅ Sponsor paid for transaction')
    console.log('   ✅ NFT sent to user')

    // Verify verification result PDA still exists (reusable)
    const verificationResult =
      await zkEscrowSolProgram.account.verificationResult.fetch(
        verificationResultPda,
      )

    expect(verificationResult.user.toBase58()).to.equal(
      user.publicKey.toBase58(),
    )
    console.log('✅ Verification result PDA remains open (reusable)')
    console.log('  - Can be used for future mints with new proofs')

    // Wait a bit for account to be fully created
    await new Promise((resolve) => setTimeout(resolve, 2000))
  })

  it('Step 3: Check NFT was minted correctly', async () => {
    console.log('\n=== Test: Check NFT Metadata and Collection State ===')

    // ========== Client Perspective: Query NFT Information ==========
    // Given: Only user address and mint address (like a real client would have)
    const nftMint = mint

    console.log('📱 Client Query - Given:')
    console.log('  - User Address:', user.publicKey.toBase58())
    console.log('  - NFT Mint Address:', nftMint.toBase58())

    // Step 1: Find user's token account (ATA) for this NFT
    const userTokenAccount = getAssociatedTokenAddressSync(nftMint, user.publicKey)
    console.log(
      '\n1️⃣ Derived token account (ATA):',
      userTokenAccount.toBase58(),
    )

    // Step 2: Get token balance
    const tokenBalance = await connection.getTokenAccountBalance(
      userTokenAccount,
    )
    console.log('2️⃣ Fetched token balance:', tokenBalance.value.uiAmount)

    // Step 3: Find metadata PDA
    const metadataPda = await getMetadata(nftMint)
    console.log('3️⃣ Derived metadata PDA:', metadataPda.toBase58())

    // Step 4: Fetch metadata account (raw data)
    const metadataAccountInfo = await connection.getAccountInfo(metadataPda)
    expect(metadataAccountInfo).to.not.be.null
    console.log('4️⃣ Fetched metadata account')

    // Step 5: Check metadata contains collection mint
    // (Manual parsing to avoid UMI compatibility issues)
    const metadataRaw = metadataAccountInfo!.data
    const collectionMintBytes = collectionMint.toBuffer()
    const hasCollectionMint = metadataRaw
      .toString('hex')
      .includes(collectionMintBytes.toString('hex'))
    console.log('5️⃣ Metadata contains collection mint:', hasCollectionMint)
    expect(hasCollectionMint).to.be.true

    // Step 6: Parse verified flag from metadata
    // Collection structure in metadata: Option<Collection>
    // If present: verified (1 byte) + key (32 bytes)
    // We look for: [0x01 (Some)] + [0x01 (verified=true)] + [32 bytes collection mint]
    const verifiedPattern = Buffer.concat([
      Buffer.from([0x01]), // Option::Some
      Buffer.from([0x01]), // verified = true
      collectionMintBytes,
    ])
    const isVerified = metadataRaw
      .toString('hex')
      .includes(verifiedPattern.toString('hex'))

    console.log('6️⃣ Collection Verification Status:')
    console.log('   Collection Mint:', collectionMint.toBase58())
    console.log('   Verified:', isVerified)

    // This is the key check!
    expect(isVerified).to.be.true
    console.log('   ✅ NFT is verified as part of the collection!')

    // Step 7: Find master edition PDA
    const masterEditionPda = await getMasterEdition(nftMint)
    console.log('7️⃣ Derived master edition PDA:', masterEditionPda.toBase58())

    // Step 8: Get collection info
    const collectionStateAccount =
      await splNftProgram.account.collectionState.fetch(collectionState)
    console.log('8️⃣ Fetched collection state')

    // Display NFT Information (like a client UI would show)
    console.log('\n📦 NFT Information (Client View):')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🔑 Owner:', user.publicKey.toBase58())
    console.log('🎨 Mint:', nftMint.toBase58())
    console.log('💼 Token Account:', userTokenAccount.toBase58())
    console.log('📊 Balance:', tokenBalance.value.uiAmount, 'NFT')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📁 Collection:', collectionStateAccount.name)
    console.log('🏷️  Symbol:', collectionStateAccount.symbol)
    console.log('🆔 Token ID:', `#${collectionStateAccount.counter.toString()}`)
    console.log('💰 Price:', collectionStateAccount.price.toString(), 'KRW')

    const expectedUri = `${collectionStateAccount.uriPrefix}/${collectionStateAccount.counter}`
    console.log('🔗 Metadata URI:', expectedUri)
    console.log('✅ Collection Verified:', isVerified)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    // Verify destination (user's ATA) owns the NFT with balance = 1
    const destinationAccount = await getAccount(connection, destination)
    console.log('\n=== Verify First NFT Ownership ===')
    console.log('Destination (ATA):', destination.toBase58())
    console.log('Owner of ATA:', destinationAccount.owner.toBase58())
    console.log('Mint:', destinationAccount.mint.toBase58())
    console.log('Balance:', destinationAccount.amount.toString())

    expect(destinationAccount.mint.toBase58()).to.equal(mint.toBase58())
    expect(destinationAccount.owner.toBase58()).to.equal(user.publicKey.toBase58())
    expect(destinationAccount.amount.toString()).to.equal('1')
    console.log('✅ Verified: destination owns the first NFT (balance = 1)')

    // Verify NFT data
    expect(collectionStateAccount.counter.toNumber()).to.equal(1)
    expect(collectionStateAccount.name).to.equal('KCONA_MOVIE1')
    expect(collectionStateAccount.symbol).to.equal('KMOVIE1')
    expect(collectionStateAccount.collectionUri).to.equal(
      'https://kcona.io/movie/_collection.json',
    )
    expect(collectionStateAccount.uriPrefix).to.equal(
      'https://kcona.io/movie/json',
    )
    expect(collectionStateAccount.price.toNumber()).to.equal(1000)

    console.log('\n✅ All NFT information retrieved and verified successfully!')
  })

  // TODO: fix. prevent user to mint 2nd NFT with the same proof.
  it('Step 4b: User mints 2nd NFT with verified proof', async () => {
    console.log('\n=== Test: Mint 2nd NFT ===')

    // Generate second NFT mint keypair
    const mint2Keypair = Keypair.generate()
    const mint2 = mint2Keypair.publicKey
    console.log('Second NFT Mint:', mint2.toBase58())

    // Get second NFT metadata and master edition
    const metadata2 = await getMetadata(mint2)
    const masterEdition2 = await getMasterEdition(mint2)
    const destination2 = getAssociatedTokenAddressSync(mint2, user.publicKey)

    // Compute budget instruction (needed for verify_collection CPI)
    const computeBudgetIx2 = ComputeBudgetProgram.setComputeUnitLimit({
      units: 400_000, // Increased limit for mint + verify
    })

    // Mint second NFT with verified proof (sponsor pays again)
    console.log('\n💰 Sponsor mints 2nd NFT for user')
    const tx = await zkEscrowSolProgram.methods
      .mintWithVerifiedProof()
      .accounts({
        signer: sponsor.publicKey,  // Sponsor pays
        verificationResult: verificationResultPda,  // Same verification PDA
        nftRecipient: user.publicKey,  // NFT goes to user
        mint: mint2,
        destination: destination2,  // ATA for user
        metadata: metadata2,
        masterEdition: masterEdition2,
        mintAuthority: mintAuthority,
        collectionMint: collectionMint,
        collectionMetadata: collectionMetadata,
        collectionMasterEdition: collectionMasterEdition,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      })
      .preInstructions([computeBudgetIx2])
      .signers([mint2Keypair])
      .rpc({
        skipPreflight: true,
      })

    console.log('✅ Second NFT minted, tx:', tx)

    // Wait a bit for state to be fully updated
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Verify counter increased to 2
    const collectionStateAccount =
      await splNftProgram.account.collectionState.fetch(collectionState)
    expect(collectionStateAccount.counter.toNumber()).to.equal(2)
    console.log(
      '✅ Collection counter:',
      collectionStateAccount.counter.toString(),
    )

    // Verify second NFT has URI with counter 2
    const metadata2AccountInfo = await connection.getAccountInfo(metadata2)
    const expectedUri2 = 'https://kcona.io/movie/json/2.json'
    const metadata2String = metadata2AccountInfo!.data.toString()
    console.log('metadata2String', metadata2String)
    expect(metadata2String.includes(expectedUri2)).to.be.true
    console.log(`✅ Second NFT minted with URI: ${expectedUri2}`)

    // Verify destination2 (user's ATA) owns the NFT with balance = 1
    const destination2Account = await getAccount(connection, destination2)
    console.log('\n=== Verify Second NFT Ownership ===')
    console.log('Destination2 (ATA):', destination2.toBase58())
    console.log('Owner of ATA:', destination2Account.owner.toBase58())
    console.log('Authority of ATA:', destination2Account.owner.toBase58())
    console.log('Mint:', destination2Account.mint.toBase58())
    console.log('Balance:', destination2Account.amount.toString())

    expect(destination2Account.mint.toBase58()).to.equal(mint2.toBase58())
    expect(destination2Account.owner.toBase58()).to.equal(user.publicKey.toBase58())
    expect(destination2Account.amount.toString()).to.equal('1')
    console.log('✅ Verified: destination2 owns the second NFT (balance = 1)')
  })
})
