import * as anchor from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
)

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.log('\n❌ Usage: anchor run show-metadata -- <METADATA_ADDRESS>')
    console.log('\nExample:')
    console.log(
      '  anchor run show-metadata -- 49gz8CuhXtgWxJ8DxWd2VojDtvMSNBZUGoKehvbZQPTa',
    )
    process.exit(1)
  }

  const metadataAddress = new PublicKey(args[0])

  console.log('\n🔍 Fetching Metadata...\n')
  console.log('📍 Metadata Address:', metadataAddress.toBase58())

  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)
  const connection = provider.connection

  try {
    // Fetch account data
    const accountInfo = await connection.getAccountInfo(metadataAddress)

    if (!accountInfo) {
      console.log('\n❌ Metadata account not found!')
      process.exit(1)
    }

    console.log('\n✅ Account found!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Owner:', accountInfo.owner.toBase58())
    console.log('Lamports:', accountInfo.lamports)
    console.log('Data Length:', accountInfo.data.length, 'bytes')
    console.log('Executable:', accountInfo.executable)

    // Parse metadata (basic parsing)
    const data = accountInfo.data

    // Skip first byte (key discriminator)
    let offset = 1

    // Update authority (32 bytes)
    const updateAuthority = new PublicKey(data.slice(offset, offset + 32))
    offset += 32
    console.log('Update Authority:', updateAuthority.toBase58())

    // Mint (32 bytes)
    const mint = new PublicKey(data.slice(offset, offset + 32))
    offset += 32
    console.log('Mint:', mint.toBase58())

    // Name (4 bytes length + string)
    const nameLen = data.readUInt32LE(offset)
    offset += 4
    const name = data
      .slice(offset, offset + nameLen)
      .toString('utf8')
      .replace(/\0/g, '')
    offset += nameLen
    console.log('Name:', name)

    // Symbol (4 bytes length + string)
    const symbolLen = data.readUInt32LE(offset)
    offset += 4
    const symbol = data
      .slice(offset, offset + symbolLen)
      .toString('utf8')
      .replace(/\0/g, '')
    offset += symbolLen
    console.log('Symbol:', symbol)

    // URI (4 bytes length + string)
    const uriLen = data.readUInt32LE(offset)
    offset += 4
    const uri = data
      .slice(offset, offset + uriLen)
      .toString('utf8')
      .replace(/\0/g, '')
    offset += uriLen
    console.log('URI:', uri)

    // Seller fee basis points (2 bytes)
    const sellerFeeBasisPoints = data.readUInt16LE(offset)
    offset += 2
    console.log('Seller Fee Basis Points:', sellerFeeBasisPoints)

    // Creators (Option<Vec<Creator>>)
    const hasCreators = data[offset]
    offset += 1

    if (hasCreators === 1) {
      const creatorsCount = data.readUInt32LE(offset)
      offset += 4
      console.log('\nCreators:')

      for (let i = 0; i < creatorsCount; i++) {
        const creatorAddress = new PublicKey(data.slice(offset, offset + 32))
        offset += 32
        const verified = data[offset] === 1
        offset += 1
        const share = data[offset]
        offset += 1

        console.log(`  ${i + 1}. Address: ${creatorAddress.toBase58()}`)
        console.log(`     Verified: ${verified}`)
        console.log(`     Share: ${share}%`)
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    // Fetch URI content if it's a valid URL
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
      console.log('\n🌐 Fetching URI content...')
      try {
        const response = await fetch(uri)
        if (response.ok) {
          const json = await response.json()
          console.log('\n📄 URI Content:')
          console.log(JSON.stringify(json, null, 2))
        } else {
          console.log('⚠️  URI returned status:', response.status)
        }
      } catch (error) {
        console.log('⚠️  Could not fetch URI content:', error.message)
      }
    }
  } catch (error) {
    console.error('\n❌ Error:', error)
    process.exit(1)
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error:', error)
    process.exit(1)
  })
