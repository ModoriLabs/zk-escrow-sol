import * as anchor from '@coral-xyz/anchor'
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { getSplNftProgram } from '../tests/utils'
import {
  COLLECTION_NAME,
  COLLECTION_SYMBOL,
  COLLECTION_URI,
  COLLECTION_URI_PREFIX,
  NFT_PRICE,
} from '../constants'

// Devnet
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
)

interface CollectionInfo {
  collectionMint: string
  collectionState: string
  collectionMetadata: string
  collectionMasterEdition: string
  mintAuthority: string
  deployer: string
  name: string
  symbol: string
  uriPrefix: string
  price: number
  cluster: string
  timestamp: string
}

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
  console.log('\n🚀 Minting Collection on Localnet...\n')

  // Setup
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)

  const connection = provider.connection
  const deployer = provider.wallet as anchor.Wallet

  console.log('📍 Cluster:', connection.rpcEndpoint)
  console.log('👤 Deployer:', deployer.publicKey.toBase58())

  // Check balance
  const balance = await connection.getBalance(deployer.publicKey)
  console.log('💰 Balance:', balance / anchor.web3.LAMPORTS_PER_SOL, 'SOL')

  if (balance < 1 * anchor.web3.LAMPORTS_PER_SOL) {
    throw new Error(
      'Insufficient balance. Please airdrop SOL: solana airdrop 10',
    )
  }

  // Load SPL-NFT program
  const splNftProgram = getSplNftProgram()

  console.log('\n📦 SPL-NFT Program:', splNftProgram.programId.toBase58())

  // Find mint authority PDA
  const [mintAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from('authority')],
    splNftProgram.programId,
  )
  console.log('🔑 Mint Authority:', mintAuthority.toBase58())

  // Generate collection mint
  const collectionKeypair = Keypair.generate()
  const collectionMint = collectionKeypair.publicKey
  console.log('\n🎨 Collection Mint:', collectionMint.toBase58())

  // Derive PDAs
  const [collectionState] = PublicKey.findProgramAddressSync(
    [Buffer.from('collection_state'), collectionMint.toBuffer()],
    splNftProgram.programId,
  )
  console.log('📊 Collection State:', collectionState.toBase58())

  const collectionMetadata = getMetadata(collectionMint)
  console.log('📄 Collection Metadata:', collectionMetadata.toBase58())

  const collectionMasterEdition = getMasterEdition(collectionMint)
  console.log(
    '🎖️  Collection Master Edition:',
    collectionMasterEdition.toBase58(),
  )

  const collectionDestination = getAssociatedTokenAddressSync(
    collectionMint,
    deployer.publicKey,
  )
  console.log('💼 Collection Destination:', collectionDestination.toBase58())

  console.log('\n⚙️  Collection Parameters:')
  console.log('  Name:', COLLECTION_NAME)
  console.log('  Symbol:', COLLECTION_SYMBOL)
  console.log('  URI Prefix:', COLLECTION_URI)
  console.log('  Price:', NFT_PRICE, 'KRW')

  console.log('\n📝 Creating collection transaction...')

  // Create collection
  const tx = await splNftProgram.methods
    .createCollection(
      COLLECTION_NAME,
      COLLECTION_SYMBOL,
      COLLECTION_URI,
      COLLECTION_URI_PREFIX,
      new anchor.BN(NFT_PRICE),
    )
    .accounts({
      user: deployer.publicKey,
      mint: collectionMint,
      metadata: collectionMetadata,
      masterEdition: collectionMasterEdition,
    })
    .signers([collectionKeypair])
    .rpc()

  console.log('\n✅ Collection created!')
  console.log('📋 Transaction:', tx)

  // Verify collection state
  console.log('\n🔍 Verifying collection state...')
  const collectionStateAccount: any =
    await splNftProgram.account.collectionState.fetch(collectionState)

  console.log('  Counter:', collectionStateAccount.counter.toString())
  console.log('  Name:', collectionStateAccount.name)
  console.log('  Symbol:', collectionStateAccount.symbol)
  console.log('  URI Prefix:', collectionStateAccount.uriPrefix)
  console.log('  Price:', collectionStateAccount.price.toString(), 'KRW')

  // Save collection info
  const collectionInfo: CollectionInfo = {
    collectionMint: collectionMint.toBase58(),
    collectionState: collectionState.toBase58(),
    collectionMetadata: collectionMetadata.toBase58(),
    collectionMasterEdition: collectionMasterEdition.toBase58(),
    mintAuthority: mintAuthority.toBase58(),
    deployer: deployer.publicKey.toBase58(),
    name: COLLECTION_NAME,
    symbol: COLLECTION_SYMBOL,
    uriPrefix: COLLECTION_URI,
    price: NFT_PRICE,
    cluster: connection.rpcEndpoint,
    timestamp: new Date().toISOString(),
  }

  console.log('\n✨ Collection minted!')
  console.log('\n📋 Summary:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Collection Mint:     ', collectionInfo.collectionMint)
  console.log('Collection State:    ', collectionInfo.collectionState)
  console.log('Mint Authority:      ', collectionInfo.mintAuthority)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  console.log('\n📌 Copy these addresses to your frontend:')
  console.log(`
const COLLECTION_ADDRESSES = {
  mint: "${collectionInfo.collectionMint}",
  state: "${collectionInfo.collectionState}",
  metadata: "${collectionInfo.collectionMetadata}",
  masterEdition: "${collectionInfo.collectionMasterEdition}",
  mintAuthority: "${collectionInfo.mintAuthority}"
};
  `)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error:', error)
    process.exit(1)
  })
