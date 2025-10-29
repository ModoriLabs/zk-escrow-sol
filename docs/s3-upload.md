# S3 Upload Script

This script uploads files from the local filesystem to AWS S3. Supports uploading multiple files at once!

## Setup

1. Add your AWS credentials to `.env`:

```env
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
```

The bucket (`kcona`) and region (`ap-northeast-2`) are configured in the script.

2. Enable ACLs in your S3 bucket (see [ACL Setup](#acl-setup) below)

3. Install dependencies (already done):

```bash
yarn install
```

## Usage

```bash
yarn upload-to-s3 <file-path-1> <file-path-2> <file-path-3> ...
```

## Examples

```bash
# Upload single file (assets/images/1.png → images/1.png)
yarn upload-to-s3 assets/images/1.png

# Upload multiple files at once
yarn upload-to-s3 assets/json/1.json assets/images/1.png

# Mix and match
yarn upload-to-s3 assets/json/1.json assets/json/2.json assets/images/1.png assets/images/2.png
```

## S3 Key Generation

The script automatically removes the `assets/` prefix from file paths to generate clean S3 keys:

- `assets/images/1.png` → S3 key: `images/1.png`
- `assets/json/1.json` → S3 key: `json/1.json`
- `assets/1.png` → S3 key: `1.png`
- `1.png` (assumes `assets/1.png`) → S3 key: `1.png`
