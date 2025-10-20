import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { readFileSync } from "fs";
import path from "path";

async function main() {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const payer = provider.wallet as anchor.Wallet;
  const connection = provider.connection;

  console.log("=".repeat(60));
  console.log("Deploying ZK Escrow Programs");
  console.log("=".repeat(60));
  console.log("Cluster:", provider.connection.rpcEndpoint);
  console.log("Payer:", payer.publicKey.toBase58());

  // Get balance
  const balance = await connection.getBalance(payer.publicKey);
  console.log("Balance:", balance / anchor.web3.LAMPORTS_PER_SOL, "SOL");
  console.log("");

  // ============================================================================
  // 1. Deploy ZK Verification Program
  // ============================================================================
  console.log("1. Deploying ZK Verification Program (zk-escrow-sol)...");

  const verificationIdlPath = path.join(__dirname, "../target/idl/zk_escrow_sol.json");
  const verificationIdl = JSON.parse(readFileSync(verificationIdlPath, "utf-8"));
  const verificationProgramId = new anchor.web3.PublicKey(verificationIdl.metadata.address);

  console.log("   Program ID:", verificationProgramId.toBase58());

  const verificationProgram = new Program(
    verificationIdl as any,
    verificationProgramId,
    provider
  );

  try {
    // Initialize verification program (if needed)
    const tx = await verificationProgram.methods
      .initialize()
      .accounts({
        signer: payer.publicKey,
      })
      .rpc();
    console.log("   Initialized, tx:", tx);
  } catch (error: any) {
    if (error.toString().includes("already in use")) {
      console.log("   Already initialized");
    } else {
      console.log("   Note:", error.message);
    }
  }
  console.log("");

  // ============================================================================
  // 2. Deploy Token Escrow Program
  // ============================================================================
  console.log("2. Deploying Token Escrow Program (token-escrow)...");

  const escrowIdlPath = path.join(__dirname, "../target/idl/token_escrow.json");
  const escrowIdl = JSON.parse(readFileSync(escrowIdlPath, "utf-8"));
  const escrowProgramId = new anchor.web3.PublicKey(escrowIdl.metadata.address);

  console.log("   Program ID:", escrowProgramId.toBase58());

  const escrowProgram = new Program(
    escrowIdl as any,
    escrowProgramId,
    provider
  );

  // Find escrow PDA
  const [escrowPda, escrowBump] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("escrow")],
    escrowProgramId
  );
  console.log("   Escrow PDA:", escrowPda.toBase58());

  // Configure escrow parameters
  const requiredThreshold = 1; // Number of witnesses required
  const admin = payer.publicKey; // Admin who can withdraw anytime
  const expectedWitnesses = [
    "0x6B0D2Db2eF61FEd00bb3Cc9eC90a1C4b36D3eC88", // Example witness address - UPDATE THIS!
  ];

  console.log("   Expected witnesses:", expectedWitnesses);

  try {
    const tx = await escrowProgram.methods
      .initialize(requiredThreshold, admin, expectedWitnesses)
      .accounts({
        escrow: escrowPda,
        payer: payer.publicKey,
        verificationProgram: verificationProgramId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("   Initialized escrow, tx:", tx);
    console.log("   Required threshold:", requiredThreshold);
    console.log("   Admin:", admin.toBase58());
  } catch (error: any) {
    if (error.toString().includes("already in use")) {
      console.log("   Already initialized");
      const escrowAccount = await escrowProgram.account.escrow.fetch(escrowPda);
      console.log("   Required threshold:", escrowAccount.requiredThreshold);
      console.log("   Admin:", escrowAccount.admin.toBase58());
      console.log("   Verification program:", escrowAccount.verificationProgram.toBase58());
      console.log("   Expected witnesses:", escrowAccount.expectedWitnesses);
    } else {
      throw error;
    }
  }
  console.log("");

  // ============================================================================
  // Summary
  // ============================================================================
  console.log("=".repeat(60));
  console.log("Deployment Summary");
  console.log("=".repeat(60));
  console.log("ZK Verification Program:", verificationProgramId.toBase58());
  console.log("Token Escrow Program:   ", escrowProgramId.toBase58());
  console.log("Escrow PDA:             ", escrowPda.toBase58());
  console.log("Admin:                  ", admin.toBase58());
  console.log("=".repeat(60));
  console.log("");
  console.log("Next steps:");
  console.log("1. Create a token mint and escrow vault (token account owned by Escrow PDA)");
  console.log("2. Anyone can deposit tokens to the vault using deposit()");
  console.log("3. Users can withdraw by providing valid ZK proof using withdraw()");
  console.log("4. Admin can withdraw anytime using adminWithdraw()");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
