# ZK Escrow Sol

ZK-proof based token escrow system on Solana.

## Programs

1. **zk-escrow-sol** - ZK proof verification program
2. **token-escrow** - Token escrow with proof-gated withdrawals
3. **spl_with_metadata** - SPL token with Metaplex metadata creation

## Setup

### Prerequisites

- Solana CLI
- Anchor CLI (v0.29.0)
- Node.js and yarn
- Rust toolchain

### Install Dependencies

```bash
yarn install
```

## Testing

Run all tests on localnet:

```bash
anchor test --arch sbf
```

## Deployment to Devnet

### 1. Configure Solana CLI

```bash
# Switch to devnet
solana config set --url https://api.devnet.solana.com

# Set your wallet (use deployer.json or your own wallet)
solana config set --keypair ./deployer.json

# Check balance
solana balance

# Request airdrop if needed
solana airdrop 2
```

### 2. Deploy All Programs

Deploy all programs to devnet:

```bash
anchor deploy --provider.cluster devnet
```

This deploys:
- `zk-escrow-sol` (verification program)
- `token-escrow` (escrow program)
- `spl_with_metadata` (metadata helper program)

### 3. Create Mock USDC Token

Create Mock USDC token with metadata:

```bash
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=./deployer.json yarn deploy-mockusdc
```

This will:
- Create a new SPL token mint (6 decimals)
- Upload USDC logo to Arweave via Irys
- Create Metaplex metadata
- Mint 10,000,000 MOCKUSDC to your wallet
- Save deployment info to `deployments/devnet/mock-usdc-deployment.json`

## Contract Addresses

### Devnet

| Contract | Address | Description |
|----------|---------|-------------|
| ZK Escrow Sol | TBD | ZK proof verification program |
| Token Escrow | TBD | Token escrow with proof-gated withdrawals |
| SPL with Metadata | [`J72XdorZyciQyrVHJvZfyhVzYWHfWPGRbtRtbor3RPst`](https://solscan.io/account/J72XdorZyciQyrVHJvZfyhVzYWHfWPGRbtRtbor3RPst?cluster=devnet) | Metaplex metadata helper program |
| Mock USDC | [`DVqboXoU3zpgvkN3HkGSdvDF8PWSvHgwq18CrqXyABDk`](https://solscan.io/token/DVqboXoU3zpgvkN3HkGSdvDF8PWSvHgwq18CrqXyABDk?cluster=devnet) | Mock USDC token mint (6 decimals) |
