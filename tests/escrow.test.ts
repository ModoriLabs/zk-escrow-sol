import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { getProgram, getTokenEscrowProgram, loadProof, serializeSignature } from "./utils";

describe("Token Escrow - Deposit and Withdraw with ZK Proof", () => {
  const escrowProgram = getTokenEscrowProgram();
  const verificationProgram = getProgram();
  const provider = anchor.AnchorProvider.env();
  const connection = provider.connection;
  const payer = provider.wallet as anchor.Wallet;

  let mint: anchor.web3.PublicKey;
  let depositorTokenAccount: anchor.web3.PublicKey;
  let userTokenAccount: anchor.web3.PublicKey;
  let escrowVault: anchor.web3.PublicKey;
  let escrowPda: anchor.web3.PublicKey;
  const admin = payer.publicKey; // For simplicity, payer is admin

  before(async () => {
    console.log("\n=== Setup: Creating Mint and Token Accounts ===");

    // Create a new mint
    mint = await createMint(
      connection,
      payer.payer,
      payer.publicKey,
      payer.publicKey,
      9
    );
    console.log("Mint created:", mint.toBase58());

    // Create depositor token account (anyone can deposit)
    const depositorTokenAccountInfo = await getOrCreateAssociatedTokenAccount(
      connection,
      payer.payer,
      mint,
      payer.publicKey
    );
    depositorTokenAccount = depositorTokenAccountInfo.address;
    console.log("Depositor token account:", depositorTokenAccount.toBase58());

    // Create user token account (for withdrawal)
    const userTokenAccountInfo = await getOrCreateAssociatedTokenAccount(
      connection,
      payer.payer,
      mint,
      payer.publicKey
    );
    userTokenAccount = userTokenAccountInfo.address;
    console.log("User token account:", userTokenAccount.toBase58());

    // Mint tokens to depositor
    await mintTo(
      connection,
      payer.payer,
      mint,
      depositorTokenAccount,
      payer.publicKey,
      10000 * 10 ** 9 // 10,000 tokens
    );
    console.log("Minted 10,000 tokens to depositor");

    // Find escrow PDA
    [escrowPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow")],
      escrowProgram.programId
    );
    console.log("Escrow PDA:", escrowPda.toBase58());

    // Create escrow vault (token account owned by escrow PDA)
    const escrowVaultInfo = await getOrCreateAssociatedTokenAccount(
      connection,
      payer.payer,
      mint,
      escrowPda,
      true // allow PDA owner
    );
    escrowVault = escrowVaultInfo.address;
    console.log("Escrow vault:", escrowVault.toBase58());
  });

  it("initializes escrow", async () => {
    console.log("\n=== Test: Initialize Escrow ===");

    const requiredThreshold = 1;
    const fixture = loadProof();
    const expectedWitnesses = [fixture.expectedWitness];

    const tx = await escrowProgram.methods
      .initialize(requiredThreshold, admin, expectedWitnesses)
      .accounts({
        escrow: escrowPda,
        payer: payer.publicKey,
        verificationProgram: verificationProgram.programId,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("Escrow initialized, tx:", tx);

    const escrowAccount = await escrowProgram.account.escrow.fetch(escrowPda);
    expect(escrowAccount.requiredThreshold).to.equal(requiredThreshold);
    expect(escrowAccount.admin.toBase58()).to.equal(admin.toBase58());
    expect(escrowAccount.verificationProgram.toBase58()).to.equal(verificationProgram.programId.toBase58());
    expect(escrowAccount.expectedWitnesses).to.deep.equal(expectedWitnesses);
  });

  it("deposits tokens into escrow", async () => {
    console.log("\n=== Test: Deposit Tokens ===");

    const depositAmount = 1000 * 10 ** 9; // 1,000 tokens

    const tx = await escrowProgram.methods
      .deposit(new anchor.BN(depositAmount))
      .accounts({
        depositor: payer.publicKey,
        depositorTokenAccount: depositorTokenAccount,
        escrowVault: escrowVault,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("Deposited 1,000 tokens, tx:", tx);

    // Check vault token balance
    const vaultBalance = await connection.getTokenAccountBalance(escrowVault);
    expect(vaultBalance.value.uiAmount).to.equal(1000);
  });

  it("withdraws tokens with valid proof", async () => {
    console.log("\n=== Test: Withdraw with Valid Proof ===");

    const withdrawAmount = 500 * 10 ** 9; // 500 tokens
    const fixture = loadProof();

    const proof = {
      claimInfo: {
        provider: fixture.claimInfo.provider,
        parameters: "",
        context: fixture.claimInfo.context,
      },
      signedClaim: {
        claim: {
          identifier: fixture.signedClaim.claim.identifier,
          owner: fixture.signedClaim.claim.owner,
          timestampS: fixture.signedClaim.claim.timestampS,
          epoch: fixture.signedClaim.claim.epoch,
        },
        signatures: fixture.signedClaim.signatures.map((sig) =>
          Buffer.from(serializeSignature(sig))
        ),
      },
    };

    const userBalanceBefore = await connection.getTokenAccountBalance(
      userTokenAccount
    );

    const tx = await escrowProgram.methods
      .withdraw(new anchor.BN(withdrawAmount), proof)
      .accounts({
        escrow: escrowPda,
        user: payer.publicKey,
        userTokenAccount: userTokenAccount,
        escrowVault: escrowVault,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        verificationProgram: verificationProgram.programId,
      })
      .rpc();

    console.log("Withdrawn 500 tokens, tx:", tx);

    // Check user token balance increased
    const userBalanceAfter = await connection.getTokenAccountBalance(
      userTokenAccount
    );
    expect(
      userBalanceAfter.value.uiAmount! - userBalanceBefore.value.uiAmount!
    ).to.equal(500);

    // Check vault balance decreased
    const vaultBalance = await connection.getTokenAccountBalance(escrowVault);
    expect(vaultBalance.value.uiAmount).to.equal(500);
  });

  it("admin can withdraw tokens", async () => {
    console.log("\n=== Test: Admin Withdraw ===");

    const withdrawAmount = 200 * 10 ** 9; // 200 tokens
    const adminTokenAccount = userTokenAccount; // Same account for simplicity

    const adminBalanceBefore = await connection.getTokenAccountBalance(
      adminTokenAccount
    );

    const tx = await escrowProgram.methods
      .adminWithdraw(new anchor.BN(withdrawAmount))
      .accounts({
        escrow: escrowPda,
        admin: admin,
        adminTokenAccount: adminTokenAccount,
        escrowVault: escrowVault,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("Admin withdrawn 200 tokens, tx:", tx);

    // Check admin token balance increased
    const adminBalanceAfter = await connection.getTokenAccountBalance(
      adminTokenAccount
    );
    expect(
      adminBalanceAfter.value.uiAmount! - adminBalanceBefore.value.uiAmount!
    ).to.equal(200);

    // Check vault balance decreased
    const vaultBalance = await connection.getTokenAccountBalance(escrowVault);
    expect(vaultBalance.value.uiAmount).to.equal(300);
  });

  it("displays final summary", async () => {
    console.log("\n=== Final Summary ===");

    const vaultBalance = await connection.getTokenAccountBalance(escrowVault);
    const userBalance = await connection.getTokenAccountBalance(
      userTokenAccount
    );

    console.log("Token Balances:");
    console.log("  - Vault:", vaultBalance.value.uiAmount);
    console.log("  - User:", userBalance.value.uiAmount);
  });
});
