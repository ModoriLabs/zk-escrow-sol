# ZK Escrow Deployment Guide

This guide explains how to deploy and use the ZK Escrow system consisting of two programs:

1. **zk-escrow-sol**: ZK proof verification program

## Architecture

The system works as follows:

1. Admin deposits SPL tokens into the escrow vault
2. Users send cash/fiat to admin (off-chain)
3. Users receive a ZK proof of their payment
4. Users can withdraw tokens from escrow by providing valid ZK proof
5. Admin can withdraw tokens anytime without proof

## Prerequisites

- Solana CLI tools installed
- Anchor CLI installed (v0.31.1)
- Node.js and yarn
- A funded Solana wallet

## Build Programs

```bash
anchor build
```

This generates:

- `target/deploy/zk_escrow_sol.so`
- `target/idl/zk_escrow_sol.json`

## Deploy to Localnet

1. Start local validator:

```bash
solana-test-validator
```

2. Deploy programs:

```bash
anchor deploy
```

3. Initialize programs:

```bash
yarn deploy:localnet
```

This will:

- Initialize the verification program
- Initialize the escrow with threshold=1 and your wallet as admin
- Display program IDs and configuration

## Deploy to Devnet

1. Set Solana cluster to devnet:

```bash
solana config set --url devnet
```

2. Airdrop SOL (if needed):

```bash
solana airdrop 2
```

3. Deploy and initialize:

```bash
yarn deploy:devnet
```

## Program IDs

After deployment, note these addresses:

- **ZK Verification Program**: `A8oUCtSKbVxthxxLiWNWnRBjhZYpJen2zC2wHGWrSqYb` (localnet)
- **Token Escrow Program**: `EsF9CU3PUf1nQZYFDaq9ws3b8YfbsC84s2MSDbSX8znw` (localnet)
- **Escrow PDA**: Derived from `["escrow"]` seed

## Usage

### 1. Initialize Escrow

Done automatically by deploy script. Parameters:

- `required_threshold`: Number of witness signatures required (default: 1)
- `admin`: Admin public key (can withdraw anytime)

### 2. Deposit Tokens

Anyone can deposit SPL tokens:

```typescript
await escrowProgram.methods
  .deposit(new anchor.BN(amount))
  .accounts({
    depositor: depositorPublicKey,
    depositorTokenAccount: depositorTokenAccount,
    escrowVault: escrowVault,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc()
```

### 3. Withdraw with Proof

Users must provide valid ZK proof:

```typescript
await escrowProgram.methods
  .withdraw(
    new anchor.BN(amount),
    proof, // ZK proof structure
    expectedWitnesses, // Array of witness addresses
  )
  .accounts({
    escrow: escrowPda,
    user: userPublicKey,
    userTokenAccount: userTokenAccount,
    escrowVault: escrowVault,
    tokenProgram: TOKEN_PROGRAM_ID,
    verificationProgram: verificationProgramId,
  })
  .rpc()
```

The proof structure:

```typescript
{
  claimInfo: {
    provider: string,
    parameters: string,
    context: string,
  },
  signedClaim: {
    claim: {
      identifier: string,
      owner: string,
      timestampS: number,
      epoch: number,
    },
    signatures: Buffer[], // Array of 65-byte signatures
  }
}
```

### 4. Admin Withdraw

Admin can withdraw without proof:

```typescript
await escrowProgram.methods
  .adminWithdraw(new anchor.BN(amount))
  .accounts({
    escrow: escrowPda,
    admin: adminPublicKey,
    adminTokenAccount: adminTokenAccount,
    escrowVault: escrowVault,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc()
```

## Testing

Run tests:

```bash
anchor test
```

Or run specific test:

```bash
anchor test tests/escrow.test.ts
```

## Security Considerations

1. **Proof Verification**: All withdrawals (except admin) require valid ZK proof via CPI call
2. **Admin Role**: Admin can withdraw anytime - ensure admin key is secure
3. **Threshold**: Set appropriate witness threshold based on security requirements
4. **Vault Management**: Escrow vault is a PDA owned by the escrow program

## Troubleshooting

### Program Already Deployed

If you see "already in use" errors, the programs are already deployed. The deploy script handles this gracefully.

### IDL Generation Errors

These are test-only errors and don't affect the deployed programs. The release binaries (.so files) compile successfully.

### Token Account Issues

Ensure:

- Escrow vault is owned by the Escrow PDA (use `allowOwnerOffCurve: true`)
- User token accounts exist before deposit/withdraw
- Sufficient token balance for operations

## Project Structure

```
zk-escrow-sol/
├── programs/
│   ├── zk-escrow-sol/     # Verification program
│   └── token-escrow/       # Escrow program
├── scripts/
│   └── deploy.ts           # Deployment script
├── tests/
│   ├── escrow.test.ts      # Escrow tests
│   └── verify-*.test.ts    # Verification tests
└── target/
    ├── deploy/             # Compiled programs
    └── idl/                # Program IDLs
```

## Support

For issues or questions:

- Check the test files for usage examples
- Review Anchor documentation
- Check Solana Program Library docs for SPL token operations
