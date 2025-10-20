import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { ZkEscrowSol } from "../target/types/zk_escrow_sol";
import { getProgram } from "./utils";

describe("Create Mint and Faucet", () => {
  const program = getProgram();
  const provider = anchor.AnchorProvider.env();
  const connection = provider.connection;
  const payer = provider.wallet as anchor.Wallet;

  let mint: anchor.web3.PublicKey;
  let tokenAccount: anchor.web3.PublicKey;

  it("creates a new mint", async () => {
    console.log("\n=== Creating New Mint ===");
    console.log("Payer:", payer.publicKey.toBase58());

    // Create a new mint
    mint = await createMint(
      connection,
      payer.payer,
      payer.publicKey, // mint authority
      payer.publicKey, // freeze authority
      9 // decimals (9 is common for SPL tokens, similar to SOL)
    );

    console.log("✅ Mint created:", mint.toBase58());
    expect(mint).to.not.be.undefined;
  });

  it("creates token account for signer", async () => {
    console.log("\n=== Creating Token Account ===");

    // Get or create associated token account for the signer
    const tokenAccountInfo = await getOrCreateAssociatedTokenAccount(
      connection,
      payer.payer,
      mint,
      payer.publicKey
    );

    tokenAccount = tokenAccountInfo.address;
    console.log("✅ Token account created:", tokenAccount.toBase58());
    console.log("   Owner:", payer.publicKey.toBase58());

    expect(tokenAccount).to.not.be.undefined;
  });

  it("mints tokens to signer (faucet)", async () => {
    console.log("\n=== Minting Tokens (Faucet) ===");

    const amount = 1000 * 10 ** 9; // 1000 tokens with 9 decimals

    // Mint tokens to the token account
    const signature = await mintTo(
      connection,
      payer.payer,
      mint,
      tokenAccount,
      payer.publicKey, // mint authority
      amount
    );

    console.log("✅ Minted", amount / 10 ** 9, "tokens");
    console.log("   Transaction signature:", signature);
    console.log("   Recipient token account:", tokenAccount.toBase58());

    // Verify the balance
    const accountInfo = await connection.getTokenAccountBalance(tokenAccount);
    console.log("   Token balance:", accountInfo.value.uiAmount);

    expect(accountInfo.value.uiAmount).to.equal(1000);
  });

  it("displays summary", () => {
    console.log("\n=== Summary ===");
    console.log("Mint Address:", mint.toBase58());
    console.log("Token Account:", tokenAccount.toBase58());
    console.log("Owner:", payer.publicKey.toBase58());
    console.log("Balance: 1000 tokens");
  });
});
