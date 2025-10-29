import * as anchor from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { getProgram } from '../tests/utils'

const RECIPIENT_BANK_ACCOUNT = '100202642943(토스뱅크)'
const ALLOWED_AMOUNT = new anchor.BN(1000) // 1000 KRW (matches proof.json: "-1000")
const FIAT_CURRENCY = 'KRW'

/**
 * Initialize zk_escrow_sol program after deployment
 *
 * This script performs the following initialization:
 * - Initialize zk_escrow_sol program with payment config
 */

async function initializeZkEscrowSol() {
  console.log('\n📋 Initialize ZK Escrow Program')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)

  const zkProgram = getProgram()
  const deployer = provider.wallet as anchor.Wallet

  console.log('👤 Authority:', deployer.publicKey.toBase58())
  console.log('📦 Program ID:', zkProgram.programId.toBase58())

  console.log('\n⚙️  Payment Configuration:')
  console.log('   Recipient:', RECIPIENT_BANK_ACCOUNT)
  console.log('   Amount:', ALLOWED_AMOUNT.toString(), FIAT_CURRENCY)
  console.log('   Currency:', FIAT_CURRENCY)

  // Derive payment config PDA
  const [paymentConfig, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from('payment_config')],
    zkProgram.programId,
  )

  console.log('\n📊 Payment Config PDA:', paymentConfig.toBase58())
  console.log('🔢 Bump:', bump)

  // Check if already initialized
  try {
    const configAccount = await zkProgram.account.paymentConfig.fetch(
      paymentConfig,
    )
    console.log('\n⚠️  Payment config already initialized!')
    console.log('   Authority:', configAccount.authority.toBase58())
    console.log('   Recipient:', configAccount.recipientBankAccount)
    console.log(
      '   Amount:',
      configAccount.allowedAmount.toString(),
      configAccount.fiatCurrency,
    )
    return paymentConfig
  } catch (error) {
    // Not initialized, proceed with initialization
    console.log('\n📝 Initializing payment config...')
  }

  // Initialize zk-escrow-sol
  const tx = await zkProgram.methods
    .initialize(RECIPIENT_BANK_ACCOUNT, ALLOWED_AMOUNT, FIAT_CURRENCY)
    .accounts({
      authority: deployer.publicKey,
    })
    .rpc()

  console.log('\n✅ ZK Escrow program initialized!')
  console.log('📋 Transaction:', tx)

  // Verify
  const configAccount = await zkProgram.account.paymentConfig.fetch(
    paymentConfig,
  )
  console.log('\n🔍 Verification:')
  console.log('   Authority:', configAccount.authority.toBase58())
  console.log('   Recipient:', configAccount.recipientBankAccount)
  console.log(
    '   Amount:',
    configAccount.allowedAmount.toString(),
    configAccount.fiatCurrency,
  )

  return paymentConfig
}

async function main() {
  console.log('\n🚀 Initializing ZK Escrow System')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)

  const connection = provider.connection
  const deployer = provider.wallet as anchor.Wallet

  console.log('\n📍 Cluster:', connection.rpcEndpoint)
  console.log('👤 Deployer:', deployer.publicKey.toBase58())

  // Check balance
  const balance = await connection.getBalance(deployer.publicKey)
  console.log('💰 Balance:', balance / anchor.web3.LAMPORTS_PER_SOL, 'SOL')

  if (balance < 1 * anchor.web3.LAMPORTS_PER_SOL) {
    throw new Error(
      'Insufficient balance. Please airdrop SOL: solana airdrop 10',
    )
  }

  try {
    // Initialize zk-escrow-sol
    const paymentConfig = await initializeZkEscrowSol()

    // Summary
    console.log('\n\n✨ Initialization Complete!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('⚙️  Payment Config:', paymentConfig.toBase58())
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    console.log('\n📌 Next Steps:')
    console.log('   1. Create NFT collection: yarn mint-collection')
    console.log('   2. Run integration tests: yarn test')
    console.log('')
  } catch (error: any) {
    console.error('\n❌ Error during initialization:', error)
    if (error.logs) {
      console.error('\n📜 Transaction Logs:')
      error.logs.forEach((log: string) => console.error('  ', log))
    }
    throw error
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Fatal Error:', error)
    process.exit(1)
  })
