import * as anchor from '@coral-xyz/anchor'
import type { Program } from '@coral-xyz/anchor'
import type NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { ASSOCIATED_PROGRAM_ID } from '@coral-xyz/anchor/dist/cjs/utils/token'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import { Keypair, SystemProgram } from '@solana/web3.js'
import type { SplNft } from '../target/types/spl_nft'
import assert from 'assert'

describe('mint-nft', () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)

  const wallet = provider.wallet as NodeWallet

  const program = anchor.workspace.splNft as Program<SplNft>

  const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey(
    'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
  )

  const mintAuthority = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from('authority')],
    program.programId,
  )[0]

  const collectionKeypair = Keypair.generate()
  const collectionMint = collectionKeypair.publicKey

  const [collectionState] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from('collection_state'), collectionMint.toBuffer()],
    program.programId,
  )

  const mintKeypair = Keypair.generate()
  const mint = mintKeypair.publicKey

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

  it('Create Collection NFT', async () => {
    console.log('\nCollection Mint Key: ', collectionMint.toBase58())

    const metadata = await getMetadata(collectionMint)
    console.log('Collection Metadata Account: ', metadata.toBase58())

    const masterEdition = await getMasterEdition(collectionMint)
    console.log('Master Edition Account: ', masterEdition.toBase58())

    const destination = getAssociatedTokenAddressSync(
      collectionMint,
      wallet.publicKey,
    )
    console.log('Destination ATA = ', destination.toBase58())

    const tx = await program.methods
      .createCollection(
        'KCONA', // name
        'KCONA', // symbol
        'https://kcona.io/metadata/_collection.json', // collection uri
        'https://kcona.io/metadata/json', // uri prefix
        new anchor.BN(1000), // price (1000 KRW)
      )
      .accountsStrict({
        user: wallet.publicKey,
        mint: collectionMint,
        collectionState,
        mintAuthority,
        metadata,
        masterEdition,
        destination,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      })
      .signers([collectionKeypair])
      .rpc({
        skipPreflight: true,
      })
    console.log('\nCollection NFT minted: TxID - ', tx)
  })

  it('Mint NFT', async () => {
    console.log('\nMint', mint.toBase58())

    const metadata = await getMetadata(mint)
    console.log('Metadata', metadata.toBase58())

    const masterEdition = await getMasterEdition(mint)
    console.log('Master Edition', masterEdition.toBase58())

    const destination = getAssociatedTokenAddressSync(mint, wallet.publicKey)
    console.log('Destination', destination.toBase58())

    const tx = await program.methods
      .mintNft()
      .accountsStrict({
        owner: wallet.publicKey,
        destination,
        metadata,
        masterEdition,
        mint,
        mintAuthority,
        collectionMint,
        collectionState,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      })
      .signers([mintKeypair])
      .rpc({
        skipPreflight: true,
      })
    console.log('\nNFT Minted! Your transaction signature', tx)

    // Fetch and verify collection state was updated
    const collectionStateAccount = await program.account.collectionState.fetch(
      collectionState,
    )

    console.log('\nCollection State Assertions:')
    console.log('Counter:', collectionStateAccount.counter.toString())
    console.log('Name:', collectionStateAccount.name)
    console.log('Symbol:', collectionStateAccount.symbol)
    console.log('URI Prefix:', collectionStateAccount.uriPrefix)
    console.log('Price:', collectionStateAccount.price.toString())

    // Assert collection state
    assert.strictEqual(
      collectionStateAccount.counter.toNumber(),
      1,
      'Counter should be incremented to 1 after first mint',
    )
    assert.strictEqual(
      collectionStateAccount.name,
      'KCONA',
      'Collection name should be KCONA',
    )
    assert.strictEqual(
      collectionStateAccount.symbol,
      'KCONA',
      'Collection symbol should be KCONA',
    )
    assert.strictEqual(
      collectionStateAccount.uriPrefix,
      'https://kcona.io/metadata/json',
      'URI prefix should be https://kcona.io/metadata/json',
    )
    assert.strictEqual(
      collectionStateAccount.price.toNumber(),
      1000,
      'Price should be 1000 KRW',
    )

    // Fetch metadata account to verify URI
    const metadataAccountInfo = await provider.connection.getAccountInfo(
      metadata,
    )
    assert.ok(metadataAccountInfo, 'Metadata account should exist')

    // Decode the metadata to check URI (basic check - metadata exists and has data)
    const metadataData = metadataAccountInfo.data
    const uriExpected = 'https://kcona.io/metadata/json/1.json'

    // The URI is stored in the metadata account - we can verify it's there
    const metadataString = metadataData.toString()
    assert.ok(
      metadataString.includes(uriExpected),
      `Metadata should contain URI: ${uriExpected}`,
    )

    console.log('✓ All assertions passed!')
    console.log(`✓ NFT minted with URI: ${uriExpected}`)
  })

  it('Verify Collection', async () => {
    const mintMetadata = await getMetadata(mint)
    console.log('\nMint Metadata', mintMetadata.toBase58())

    const collectionMetadata = await getMetadata(collectionMint)
    console.log('Collection Metadata', collectionMetadata.toBase58())

    const collectionMasterEdition = await getMasterEdition(collectionMint)
    console.log('Collection Master Edition', collectionMasterEdition.toBase58())

    const tx = await program.methods
      .verifyCollection()
      .accountsStrict({
        authority: wallet.publicKey,
        metadata: mintMetadata,
        mint,
        mintAuthority,
        collectionMint,
        collectionMetadata,
        collectionMasterEdition,
        systemProgram: SystemProgram.programId,
        sysvarInstruction: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      })
      .rpc({
        skipPreflight: true,
      })
    console.log('\nCollection Verified! Your transaction signature', tx)
  })
})
