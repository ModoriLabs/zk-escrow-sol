import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { readFileSync } from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config()

async function uploadFile(
  s3Client: S3Client,
  filePath: string,
  bucketName: string,
  region: string,
) {
  try {
    // Generate S3 key: remove 'assets/' prefix if present
    const s3Key = filePath.startsWith('assets/')
      ? filePath.substring('assets/'.length)
      : path.basename(filePath)

    console.log('\n📁 File:', filePath)
    console.log('🔑 S3 Key:', s3Key)

    // Read file
    const fileContent = readFileSync(path.resolve(__dirname, '..', filePath))
    console.log('📦 Size:', fileContent.length, 'bytes')

    // Determine content type
    const ext = path.extname(filePath).toLowerCase()
    const contentTypeMap: { [key: string]: string } = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.json': 'application/json',
      '.txt': 'text/plain',
    }
    const contentType = contentTypeMap[ext] || 'application/octet-stream'

    // Upload to S3 with public-read ACL
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: fileContent,
      ContentType: contentType,
      ACL: 'public-read',
    })

    console.log('📤 Uploading...')
    await s3Client.send(command)

    const s3Url = `https://${bucketName}.s3.${region}.amazonaws.com/${s3Key}`

    console.log('✅ Upload successful!')
    console.log('🔗 S3 URL:', s3Url)

    return { success: true, filePath, s3Url }
  } catch (error) {
    console.error('❌ Upload failed:', error)
    return { success: false, filePath, error }
  }
}

async function main() {
  console.log('\n=== S3 Upload Script ===')

  // Check required environment variables
  if (!process.env.AWS_ACCESS_KEY_ID) {
    console.error('❌ Error: AWS_ACCESS_KEY_ID not found in .env')
    process.exit(1)
  }

  if (!process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('❌ Error: AWS_SECRET_ACCESS_KEY not found in .env')
    process.exit(1)
  }

  const bucketName = process.env.AWS_S3_BUCKET || 'kcona'
  const region = process.env.AWS_REGION || 'ap-northeast-2'

  console.log('🪣 Bucket:', bucketName)
  console.log('🌏 Region:', region)

  // Configure S3 client
  const s3Client = new S3Client({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  })

  // Get file paths from command line arguments
  let filePaths = process.argv.slice(2)

  // Require at least one file path
  if (filePaths.length === 0) {
    console.error('\n❌ Error: Please provide at least one file path')
    console.error('Usage: yarn upload-to-s3 <file-path> [<file-path2> ...]')
    console.error('\nExamples:')
    console.error('  yarn upload-to-s3 assets/images/1.png')
    console.error('  yarn upload-to-s3 assets/json/1.json assets/images/1.png')
    console.error('  yarn upload-to-s3 1.png 2.png')
    process.exit(1)
  }

  // Process each file path
  filePaths = filePaths.map((filePath) => {
    // If the file path doesn't include a directory, assume it's in assets/
    if (!filePath.includes('/') && !filePath.includes('\\')) {
      return `assets/${filePath}`
    }
    return filePath
  })

  console.log(`\n📋 Uploading ${filePaths.length} file(s)...\n`)

  // Upload all files
  const results = []
  for (const filePath of filePaths) {
    const result = await uploadFile(s3Client, filePath, bucketName, region)
    results.push(result)
  }

  // Summary
  console.log('\n' + '='.repeat(50))
  console.log('📊 Upload Summary')
  console.log('='.repeat(50))

  const successful = results.filter((r) => r.success)
  const failed = results.filter((r) => !r.success)

  console.log(`✅ Successful: ${successful.length}`)
  console.log(`❌ Failed: ${failed.length}`)

  if (successful.length > 0) {
    console.log('\n✅ Uploaded files:')
    successful.forEach((r) => {
      console.log(`  - ${r.s3Url}`)
    })
  }

  if (failed.length > 0) {
    console.log('\n❌ Failed files:')
    failed.forEach((r) => {
      console.log(`  - ${r.filePath}`)
    })
    process.exit(1)
  }
}

main()
