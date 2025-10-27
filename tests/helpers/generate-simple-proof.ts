import { Wallet, keccak256, toUtf8Bytes } from 'ethers'
import { writeFileSync } from 'fs'
import path from 'path'

async function generateSimpleProof() {
  // Create a test wallet
  const privateKey =
    '0x1234567890123456789012345678901234567890123456789012345678901234'
  const wallet = new Wallet(privateKey)

  console.log('Witness address:', wallet.address)

  // 1. Create simple ClaimInfo
  const claimInfo = {
    provider: 'http',
    parameters: '{"dob":"1988-02-10"}',
    context: '0x0000000000000000000000000000000000000001',
  }

  // 2. Calculate identifier (hash of claimInfo)
  const claimInfoStr = [
    claimInfo.provider,
    '\n',
    claimInfo.parameters,
    '\n',
    claimInfo.context,
  ].join('')
  const identifier = keccak256(toUtf8Bytes(claimInfoStr))

  console.log('Computed identifier:', identifier)

  // 3. Create claim data
  const owner = '0xf9f25d1b846625674901ace47d6313d1ac795265'
  const timestampS = 1750832369
  const epoch = 1

  // 4. Serialize claim data for signing
  const claimMessage = [
    identifier,
    owner.toLowerCase(),
    timestampS.toString(),
    epoch.toString(),
  ].join('\n')

  console.log('Claim message to sign:', claimMessage)

  // 5. Sign the claim message
  const signature = await wallet.signMessage(claimMessage)

  console.log('Signature:', signature)

  // 6. Create the proof structure
  const proof = {
    claimInfo,
    signedClaim: {
      claim: {
        identifier,
        owner,
        timestampS,
        epoch,
      },
      signatures: [signature],
    },
    isAppclipProof: false,
    expectedWitness: wallet.address,
  }

  // 7. Save to file
  const outputPath = path.join(__dirname, 'fixtures', 'simple-proof.json')
  writeFileSync(outputPath, JSON.stringify(proof, null, 2))

  console.log('\nProof saved to:', outputPath)
}

generateSimpleProof().catch(console.error)
