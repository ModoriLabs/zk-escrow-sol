import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Metaplex,
  irysStorage,
  keypairIdentity,
  toMetaplexFile,
} from "@metaplex-foundation/js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { SplWithMetadata } from "../target/types/spl_with_metadata";

async function main() {
  // Configure the client
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const wallet = provider.wallet as anchor.Wallet;
  const connection = provider.connection;
  const program = anchor.workspace.splWithMetadata as Program<SplWithMetadata>;

  console.log("=".repeat(60));
  console.log("Deploying Mock USDC Token to Devnet");
  console.log("=".repeat(60));
  console.log("Cluster:", connection.rpcEndpoint);
  console.log("Payer:", wallet.publicKey.toBase58());

  // Get balance
  const balance = await connection.getBalance(wallet.publicKey);
  console.log("Balance:", balance / anchor.web3.LAMPORTS_PER_SOL, "SOL");
  console.log("");

  if (balance < 0.5 * anchor.web3.LAMPORTS_PER_SOL) {
    console.log("⚠️  Warning: Balance is low. You may need to request an airdrop:");
    console.log("   solana airdrop 2");
    console.log("");
  }

  const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

  // ============================================================================
  // 1. Configure Metaplex with Irys (for Arweave storage)
  // ============================================================================
  console.log("1. Configuring Metaplex with Irys storage...");

  const metaplex = Metaplex.make(connection)
    .use(keypairIdentity(wallet.payer))
    .use(
      irysStorage({
        address: "https://devnet.irys.xyz",
        providerUrl: connection.rpcEndpoint,
        timeout: 60_000,
      })
    );

  console.log("   Metaplex configured");

  // ============================================================================
  // 2. Create the Mint
  // ============================================================================
  console.log("\n2. Creating Mock USDC mint...");

  const mintKeypair = Keypair.generate();

  await createMint(
    connection,
    wallet.payer,
    wallet.publicKey, // mint authority
    wallet.publicKey, // freeze authority
    6, // decimals (USDC uses 6 decimals)
    mintKeypair
  );

  const mintPubkey = mintKeypair.publicKey;
  console.log("   Mint created:", mintPubkey.toBase58());

  // ============================================================================
  // 3. Upload USDC Logo to Arweave via Irys
  // ============================================================================
  console.log("\n3. Uploading USDC logo to Arweave...");

  const imageBuffer = readFileSync(
    path.resolve(__dirname, "../assets/usdc-logo.png")
  );
  const metaplexFile = toMetaplexFile(imageBuffer, "usdc-logo.png");

  console.log("   Uploading to Irys/Arweave (this may take a moment)...");
  const arweaveMetadataUri: string = await metaplex.storage().upload(metaplexFile);
  const metadataTxId = arweaveMetadataUri.split("/").pop()!;
  const imageUri = `https://devnet.irys.xyz/${metadataTxId}`;

  console.log("   Image uploaded successfully!");
  console.log("   Image URI:", imageUri);

  // ============================================================================
  // 4. Derive Metadata PDA
  // ============================================================================
  console.log("\n4. Deriving metadata PDA...");

  const [metadataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mintPubkey.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID
  );

  console.log("   Metadata PDA:", metadataPda.toBase58());

  // ============================================================================
  // 5. Create Token Metadata using spl_with_metadata program
  // ============================================================================
  console.log("\n5. Creating token metadata on-chain...");

  const tx = await program.methods
    .createTokenMetadata(
      "Mock USDC",              // name
      "MOCKUSDC",               // symbol
      imageUri,                 // uri
      0,                        // 0% royalty (no royalties for fungible tokens)
      true                      // mutable
    )
    .accounts({
      metadata: metadataPda,
      mint: mintPubkey,
      authority: wallet.publicKey,
      payer: wallet.publicKey,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
    })
    .rpc();

  console.log("   Metadata created successfully!");
  console.log("   Transaction signature:", tx);

  // ============================================================================
  // 6. Create Token Account and Mint Initial Supply
  // ============================================================================
  console.log("\n6. Creating token account and minting tokens...");

  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    wallet.payer,
    mintPubkey,
    wallet.publicKey
  );

  console.log("   Token account:", tokenAccount.address.toBase58());

  // Mint 10,000,000 MOCKUSDC (with 6 decimals)
  const mintAmount = 10_000_000 * 10 ** 6;

  await mintTo(
    connection,
    wallet.payer,
    mintPubkey,
    tokenAccount.address,
    wallet.publicKey,
    mintAmount
  );

  console.log("   Minted 10,000,000 MOCKUSDC to token account");

  // ============================================================================
  // 7. Save Deployment Info
  // ============================================================================
  console.log("\n7. Saving deployment info...");

  const deploymentInfo = {
    cluster: connection.rpcEndpoint,
    mint: mintPubkey.toBase58(),
    tokenAccount: tokenAccount.address.toBase58(),
    owner: wallet.publicKey.toBase58(),
    metadata: metadataPda.toBase58(),
    imageUri: imageUri,
    decimals: 6,
    symbol: "MOCKUSDC",
    name: "Mock USDC",
    initialSupply: "10,000,000",
    deployedAt: new Date().toISOString(),
  };

  // Create deployments directory if it doesn't exist
  const deploymentsDir = path.resolve(__dirname, "../deployments/devnet");
  const fs = require("fs");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const outputPath = path.resolve(deploymentsDir, "mock-usdc-deployment.json");
  writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));

  console.log("   Deployment info saved to:", outputPath);

  // ============================================================================
  // Summary
  // ============================================================================
  console.log("\n" + "=".repeat(60));
  console.log("Mock USDC Deployment Summary");
  console.log("=".repeat(60));
  console.log("Mint Address:        ", mintPubkey.toBase58());
  console.log("Metadata Address:    ", metadataPda.toBase58());
  console.log("Token Account:       ", tokenAccount.address.toBase58());
  console.log("Owner:               ", wallet.publicKey.toBase58());
  console.log("Balance:              10,000,000 MOCKUSDC");
  console.log("Decimals:             6");
  console.log("Symbol:               MOCKUSDC");
  console.log("Name:                 Mock USDC");
  console.log("Image URI:           ", imageUri);
  console.log("=".repeat(60));
  console.log("\nExplorer Links:");
  console.log(`Mint:     https://explorer.solana.com/address/${mintPubkey.toBase58()}?cluster=devnet`);
  console.log(`Metadata: https://explorer.solana.com/address/${metadataPda.toBase58()}?cluster=devnet`);
  console.log(`Token:    https://explorer.solana.com/address/${tokenAccount.address.toBase58()}?cluster=devnet`);
  console.log("\n✅ Mock USDC deployed successfully!");
  console.log("\nYou can now use this mint address in your escrow:");
  console.log(`Mint: ${mintPubkey.toBase58()}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error deploying Mock USDC:");
    console.error(error);
    process.exit(1);
  });
