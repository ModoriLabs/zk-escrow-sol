# ZK Escrow Solana

A Solana program suite for verifying zero-knowledge proofs and minting NFTs based on payment verification.

## Architecture

This project consists of three Solana programs that work together:

### 1. **zk-escrow-sol** (Main Program)
The core verification program that validates zero-knowledge proofs of payment transactions.

**Key Features:**
- Verifies cryptographic proofs from payment providers
- Validates payment details (recipient, amount, currency)
- Stores verification results in reusable PDAs
- Integrates with NFT minting via CPI (Cross-Program Invocation)

**Main Instructions:**
- `initialize` - Set up payment configuration (recipient, amount, currency)
- `verify_proof` - Verify ZK proof and store result in PDA
- `mint_with_verified_proof` - Mint NFT after successful verification

### 2. **spl-nft** (NFT Program)
Handles NFT collection creation and individual NFT minting using Metaplex standards.

**Key Features:**
- Create NFT collections with metadata
- Mint individual NFTs with auto-incrementing counters
- Verify NFTs as part of a collection
- Support for URI prefixes and dynamic metadata

**Main Instructions:**
- `create_collection` - Initialize a new NFT collection
- `mint_nft` - Mint individual NFTs from a collection
- `verify_collection` - Mark NFTs as verified collection members

### 3. **nullifier-registry** (Replay Prevention)
Prevents replay attacks by tracking used proof nullifiers.

**Key Features:**
- Global nullifier registry for tracking used proofs
- Per-nullifier records with timestamps
- Authority-based access control for CPI callers

**Main Instructions:**
- `initialize` - Create the global nullifier registry
- `mark_nullifier` - Mark a proof nullifier as used (CPI only)
- `check_nullifier` - Verify if a nullifier has been used

## Program Flow

1. **Setup**: Initialize payment config and create NFT collection
2. **Verification**: User submits ZK proof → Program verifies and stores result
3. **Minting**: Sponsor mints NFT → NFT sent to verified user
4. **Protection**: Nullifier prevents proof reuse

## Deployed Addresses (Devnet)

| Program | Program ID |
|---------|-----------|
| **zk-escrow-sol** | `J36AoiYodAamYMT8w29JX4XD9J9B3CSoYGiFnBdJsXYx` |
| **spl-nft** | `2BrzdsjAbsuvHFcJZswEq6YBNBzuzy2AEXpMR6FLrwck` |
| **nullifier-registry** | `5djS2Qd4ob9vWUA5qJc9iPeWnjrJ2CDQctGpyzjFhsRz` |

### Collection Addresses

```typescript
const COLLECTION_ADDRESSES = {
  mint: "DXpDR4i1J6dKuDew4o8bjMVxxfLbsHkdNBukbxEoNq9D",
  state: "DxDoaZQEXukRBfV62VPLDeYFPGWndKRqxzfRKDefabyZ",
  metadata: "BNJnSzbvw9EoeKZchD3hK6UopPRAzMzZyLJz6GKGzzAu",
  masterEdition: "Ckvrj9G5y4HBKPtkX9V4ALRNN7e7xPPidjGLbdxdhav8",
  mintAuthority: "9vpYGQ76kgSwBja8EDJUyRjFBSc2tfxb43KjQpJBd7K5"
};
```

## Run Test

`anchor test`

## Deployment

### Devnet

#### Setup Local Deployer

```sh
solana-keygen recover --outfile ./deployer.json --force
-> <seed phrase>
```

#### Build

```
anchor keys sync
solana-keygen pubkey target/deploy/zk_escrow_sol-keypair.json
anchor build -- --features devnet
```

#### Deploy

```
solana airdrop 100 ./deployer.json --url devnet
anchor deploy --provider.cluster devnet
```

#### Deploy Collection
```
anchor run initialize
anchor run mint-collection
```

### Localnet
```
anchor localnet # use this instead of 'solana-test-validator'
```

### Upload Image to Irys/Arweave

Upload an image from the assets folder to Irys (Arweave) for decentralized storage:

```sh
npm run upload-to-irys <counter>
```

Example:

```sh
npm run upload-to-irys 1  # uploads assets/1.png
npm run upload-to-irys 2  # uploads assets/2.png
```

This will return an Arweave URI that can be used for NFT metadata or token logos.

### scripts
```
anchor run mint-collection
anchor run mint-nft -- 3AW5mwSFBevBMF4ZyN7tv9atPPWBbtmrvxmyuf31Nv6C
anchor run show-metadata -- H2TTzWDkfRHCCP2fS5vCZnKJc9P4eaWmqeZVwUz4nB2C
```
