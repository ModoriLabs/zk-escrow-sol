import * as anchor from "@coral-xyz/anchor";
import {
  Metaplex,
  irysStorage,
  keypairIdentity,
  toMetaplexFile,
} from "@metaplex-foundation/js";
import { Connection, Keypair } from "@solana/web3.js";
import { readFileSync } from "fs";
import path from "path";

async function main() {
  // Get counter from command line arguments
  const counter = process.argv[2];

  if (!counter) {
    console.error("❌ Error: Please provide a counter number");
    console.error("Usage: npm run upload-to-irys <counter>");
    console.error("Example: npm run upload-to-irys 1");
    process.exit(1);
  }

  // Configure the client manually
  const clusterUrl = process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
  const walletPath = process.env.ANCHOR_WALLET || path.resolve(__dirname, "../deployer.json");

  const connection = new Connection(clusterUrl, "confirmed");
  const walletKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(walletPath, "utf-8")))
  );

  const wallet = new anchor.Wallet(walletKeypair);

  console.log("=".repeat(60));
  console.log("Uploading Image to Irys/Arweave");
  console.log("=".repeat(60));
  console.log("Image Number:", counter);
  console.log("Cluster:", clusterUrl);
  console.log("Payer:", wallet.publicKey.toBase58());

  // Get balance
  const balance = await connection.getBalance(wallet.publicKey);
  console.log("Balance:", balance / anchor.web3.LAMPORTS_PER_SOL, "SOL");
  console.log("");

  if (balance < 0.1 * anchor.web3.LAMPORTS_PER_SOL) {
    console.log("⚠️  Warning: Balance is low. You may need to request an airdrop:");
    console.log("   solana airdrop 2");
    console.log("");
  }

  // ============================================================================
  // Configure Metaplex with Irys (for Arweave storage)
  // ============================================================================
  console.log("1. Configuring Metaplex with Irys storage...");

  const metaplex = Metaplex.make(connection)
    .use(keypairIdentity(walletKeypair))
    .use(
      irysStorage({
        address: "https://devnet.irys.xyz",
        providerUrl: clusterUrl,
        timeout: 60_000,
      })
    );

  console.log("   Metaplex configured");

  // ============================================================================
  // Upload Image to Arweave via Irys
  // ============================================================================
  console.log("\n2. Uploading image to Arweave...");

  const imagePath = path.resolve(__dirname, `../assets/${counter}.png`);
  const imageBuffer = readFileSync(imagePath);
  const metaplexFile = toMetaplexFile(imageBuffer, `${counter}.png`);

  console.log("   Uploading to Irys/Arweave (this may take a moment)...");
  const arweaveMetadataUri: string = await metaplex.storage().upload(metaplexFile);
  const metadataTxId = arweaveMetadataUri.split("/").pop()!;
  const imageUri = `https://devnet.irys.xyz/${metadataTxId}`;

  console.log("   Image uploaded successfully!");
  console.log("   Image URI:", imageUri);

  // ============================================================================
  // Summary
  // ============================================================================
  console.log("\n" + "=".repeat(60));
  console.log("Upload Summary");
  console.log("=".repeat(60));
  console.log("Image Path:  ", imagePath);
  console.log("Image URI:   ", imageUri);
  console.log("Transaction: ", metadataTxId);
  console.log("=".repeat(60));
  console.log("\n✅ Image uploaded successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error uploading image:");
    console.error(error);
    process.exit(1);
  });
