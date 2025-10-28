import * as anchor from '@coral-xyz/anchor'
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import { getSplNftProgram } from '../tests/utils'

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
)

const getMetadata = (mint: PublicKey): PublicKey => {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID,
  )[0]
}

const getMasterEdition = (mint: PublicKey): PublicKey => {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
      Buffer.from('edition'),
    ],
    TOKEN_METADATA_PROGRAM_ID,
  )[0]
}

async function main() {
  console.log('\n🎨 Minting NFT from Collection...\n')

  // Setup
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)

  const connection = provider.connection
  const owner = provider.wallet as anchor.Wallet

  console.log('📍 Cluster:', connection.rpcEndpoint)
  console.log('👤 Owner:', owner.publicKey.toBase58())

  // Check balance
  const balance = await connection.getBalance(owner.publicKey)
  console.log('💰 Balance:', balance / anchor.web3.LAMPORTS_PER_SOL, 'SOL')

  if (balance < 0.5 * anchor.web3.LAMPORTS_PER_SOL) {
    throw new Error(
      'Insufficient balance. Please airdrop SOL: solana airdrop 5',
    )
  }

  // Load SPL-NFT program
  const splNftProgram = getSplNftProgram()

  console.log('\n📦 SPL-NFT Program:', splNftProgram.programId.toBase58())

  // Get collection mint from command line args or use default
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.log('\n❌ Usage: npm run mint-nft <COLLECTION_MINT_ADDRESS>')
    console.log('\nExample:')
    console.log('  npm run mint-nft 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')
    process.exit(1)
  }

  const collectionMintAddress = new PublicKey(args[0])
  console.log('\n🎨 Collection Mint:', collectionMintAddress.toBase58())

  // Find mint authority PDA
  const [mintAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from('authority')],
    splNftProgram.programId,
  )
  console.log('🔑 Mint Authority:', mintAuthority.toBase58())

  // Find collection state PDA
  const [collectionState] = PublicKey.findProgramAddressSync(
    [Buffer.from('collection_state'), collectionMintAddress.toBuffer()],
    splNftProgram.programId,
  )
  console.log('📊 Collection State:', collectionState.toBase58())

  // Verify collection exists
  console.log('\n🔍 Verifying collection...')
  try {
    const collectionStateAccount: any =
      await splNftProgram.account.collectionState.fetch(collectionState)
    console.log('  ✅ Collection found!')
    console.log('  Name:', collectionStateAccount.name)
    console.log('  Symbol:', collectionStateAccount.symbol)
    console.log('  Current counter:', collectionStateAccount.counter.toString())
    console.log('  URI Prefix:', collectionStateAccount.uriPrefix)
    console.log('  Price:', collectionStateAccount.price.toString(), 'KRW')
  } catch (error) {
    console.error('\n❌ Collection not found or invalid!')
    console.error('Please check the collection mint address.')
    process.exit(1)
  }

  // Generate NFT mint
  const nftKeypair = Keypair.generate()
  const nftMint = nftKeypair.publicKey
  console.log('\n🎨 NFT Mint:', nftMint.toBase58())

  // Derive PDAs for NFT
  const nftMetadata = getMetadata(nftMint)
  console.log('📄 NFT Metadata:', nftMetadata.toBase58())

  const nftMasterEdition = getMasterEdition(nftMint)
  console.log('🎖️  NFT Master Edition:', nftMasterEdition.toBase58())

  const nftDestination = getAssociatedTokenAddressSync(nftMint, owner.publicKey)
  console.log('💼 NFT Destination:', nftDestination.toBase58())

  console.log('\n📝 Creating NFT transaction...')

  // Mint NFT
  // Note: destination, mintAuthority, collectionState are auto-resolved PDAs
  const tx = await splNftProgram.methods
    .mintNft()
    .accounts({
      owner: owner.publicKey,
      mint: nftMint,
      metadata: nftMetadata,
      masterEdition: nftMasterEdition,
      collectionMint: collectionMintAddress,
    })
    .signers([nftKeypair])
    .rpc()

  console.log('\n✅ NFT minted!')
  console.log('📋 Transaction:', tx)

  // Verify updated collection state
  console.log('\n🔍 Verifying updated collection state...')
  const updatedCollectionState: any =
    await splNftProgram.account.collectionState.fetch(collectionState)

  console.log('  New counter:', updatedCollectionState.counter.toString())

  console.log('\n✨ NFT successfully minted!')
  console.log('\n📋 Summary:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('NFT Mint:            ', nftMint.toBase58())
  console.log('NFT Metadata:        ', nftMetadata.toBase58())
  console.log('NFT Master Edition:  ', nftMasterEdition.toBase58())
  console.log('NFT Destination:     ', nftDestination.toBase58())
  console.log('Collection Mint:     ', collectionMintAddress.toBase58())
  console.log('Token ID:            ', updatedCollectionState.counter.toString())
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  console.log('\n📌 NFT details:')
  console.log(`
const NFT_ADDRESSES = {
  mint: "${nftMint.toBase58()}",
  metadata: "${nftMetadata.toBase58()}",
  masterEdition: "${nftMasterEdition.toBase58()}",
  tokenAccount: "${nftDestination.toBase58()}",
  tokenId: ${updatedCollectionState.counter.toString()}
};
  `)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error:', error)
    process.exit(1)
  })
