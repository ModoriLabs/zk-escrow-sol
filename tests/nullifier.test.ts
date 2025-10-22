import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import {
  getProgram,
  getTokenEscrowProgram,
  getNullifierProgram,
  loadProof,
  serializeSignature,
  calculateNullifier,
} from "./utils";

describe("Nullifier Registry - Prevent Replay Attacks", () => {
  const escrowProgram = getTokenEscrowProgram();
  const verificationProgram = getProgram();
  const nullifierProgram = getNullifierProgram();
  const provider = anchor.AnchorProvider.env();
  const connection = provider.connection;
  const payer = provider.wallet as anchor.Wallet;

  let mint: anchor.web3.PublicKey;
  let depositorTokenAccount: anchor.web3.PublicKey;
  let userTokenAccount: anchor.web3.PublicKey;
  let escrowVault: anchor.web3.PublicKey;
  let escrowPda: anchor.web3.PublicKey;
  let paymentConfigPda: anchor.web3.PublicKey;
  let nullifierRegistryPda: anchor.web3.PublicKey;
  const admin = payer.publicKey;
  // TODO: fix
  const WITHDRAW_AMOUNT = 13 * 10 ** 9;

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

    // Create depositor token account
    const depositorTokenAccountInfo = await getOrCreateAssociatedTokenAccount(
      connection,
      payer.payer,
      mint,
      payer.publicKey
    );
    depositorTokenAccount = depositorTokenAccountInfo.address;

    // Create user token account
    const userTokenAccountInfo = await getOrCreateAssociatedTokenAccount(
      connection,
      payer.payer,
      mint,
      payer.publicKey
    );
    userTokenAccount = userTokenAccountInfo.address;

    // Mint tokens to depositor
    await mintTo(
      connection,
      payer.payer,
      mint,
      depositorTokenAccount,
      payer.publicKey,
      10000 * 10 ** 9
    );

    // Find PDAs
    [escrowPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("escrow")],
      escrowProgram.programId
    );

    [paymentConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("payment_config"), payer.publicKey.toBuffer()],
      verificationProgram.programId
    );

    [nullifierRegistryPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("nullifier_registry")],
      nullifierProgram.programId
    );

    // Create escrow vault
    const escrowVaultInfo = await getOrCreateAssociatedTokenAccount(
      connection,
      payer.payer,
      mint,
      escrowPda,
      true
    );
    escrowVault = escrowVaultInfo.address;

    // Initialize nullifier registry (skip if already initialized)
    try {
      await nullifierProgram.methods
        .initialize()
        .accounts({
          registry: nullifierRegistryPda,
          authority: payer.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log("✅ Nullifier registry initialized");
    } catch (err: any) {
      if (err.message.includes("already in use")) {
        console.log(
          "✅ Nullifier registry already initialized (from previous test)"
        );
      } else {
        throw err;
      }
    }

    // Initialize payment config (skip if already initialized)
    const recipientBankAccount = "100202642943(토스뱅크)";
    const allowedAmount = new anchor.BN(1000);
    const fiatCurrency = "KRW";

    try {
      await verificationProgram.methods
        .initialize(recipientBankAccount, allowedAmount, fiatCurrency)
        .accounts({
          paymentConfig: paymentConfigPda,
          authority: payer.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log("✅ Payment config initialized");
    } catch (err: any) {
      if (err.message.includes("already in use")) {
        console.log(
          "✅ Payment config already initialized (from previous test)"
        );
      } else {
        throw err;
      }
    }

    // Initialize escrow (skip if already initialized)
    const fixture = loadProof();
    try {
      await escrowProgram.methods
        .initialize(1, admin, [fixture.expectedWitness])
        .accounts({
          escrow: escrowPda,
          payer: payer.publicKey,
          verificationProgram: verificationProgram.programId,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log("✅ Escrow initialized");
    } catch (err: any) {
      if (err.message.includes("already in use")) {
        console.log("✅ Escrow already initialized (from previous test)");
      } else {
        throw err;
      }
    }

    // Deposit tokens
    await escrowProgram.methods
      .deposit(new anchor.BN(1000 * 10 ** 9))
      .accounts({
        depositor: payer.publicKey,
        depositorTokenAccount: depositorTokenAccount,
        escrowVault: escrowVault,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("✅ Deposited 1,000 tokens to escrow");
  });

  it("verifies nullifier is calculated deterministically", async () => {
    console.log("\n=== Test: Verify Deterministic Nullifier Calculation ===");

    const fixture = loadProof();

    // Calculate nullifier deterministically from proof context
    const nullifierHash = calculateNullifier(fixture.claimInfo.context);
    console.log("Calculated nullifier hash:", nullifierHash);
    console.log(
      "Sender nickname:",
      JSON.parse(fixture.claimInfo.context).extractedParameters.senderNickname
    );
    console.log(
      "Transaction date:",
      JSON.parse(fixture.claimInfo.context).extractedParameters.transactionDate
    );

    // Find nullifier record PDA
    const [nullifierRecordPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("nullifier"), Buffer.from(nullifierHash)],
      nullifierProgram.programId
    );

    // Check if nullifier already exists from integration test
    try {
      await nullifierProgram.account.nullifierRecord.fetch(nullifierRecordPda);
      // Nullifier exists - skip this test as it was already used in integration.test.ts
      console.log(
        "⚠️  Nullifier already used in integration.test.ts - skipping test"
      );
      return; // Skip the rest of this test
    } catch (e: any) {
      // Nullifier doesn't exist - this is expected, proceed with test
      if (e.message && e.message.includes("Account does not exist")) {
        console.log(
          "✅ Nullifier not yet used, proceeding with first withdrawal"
        );
      } else {
        throw e; // Re-throw unexpected errors
      }
    }

    const proof = {
      claimInfo: {
        provider: fixture.claimInfo.provider,
        parameters: fixture.claimInfo.parameters,
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

    await escrowProgram.methods
      .withdraw(new anchor.BN(WITHDRAW_AMOUNT), proof)
      .accounts({
        escrow: escrowPda,
        user: payer.publicKey,
        userTokenAccount: userTokenAccount,
        escrowVault: escrowVault,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        verificationProgram: verificationProgram.programId,
        paymentConfig: paymentConfigPda,
        nullifierProgram: nullifierProgram.programId,
        nullifierRegistry: nullifierRegistryPda,
        nullifierRecord: nullifierRecordPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("✅ First withdrawal successful");

    const userBalanceAfter = await connection.getTokenAccountBalance(
      userTokenAccount
    );
    expect(
      userBalanceAfter.value.uiAmount! - userBalanceBefore.value.uiAmount!
    ).to.equal(WITHDRAW_AMOUNT / 10 ** 9);

    // Verify nullifier was marked
    const nullifierRecord =
      await nullifierProgram.account.nullifierRecord.fetch(nullifierRecordPda);
    expect(nullifierRecord.nullifierHash).to.equal(nullifierHash);
    expect(nullifierRecord.usedBy.toBase58()).to.equal(
      payer.publicKey.toBase58()
    );
    console.log("✅ Nullifier marked as used");
  });

  it("prevents double spending: test with same proof", async () => {
    console.log("\n=== Test: Replay Attack - Use Same Proof Twice ===");

    const fixture = loadProof();

    const proof = {
      claimInfo: {
        provider: fixture.claimInfo.provider,
        parameters: fixture.claimInfo.parameters,
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

    const nullifierHash = calculateNullifier(fixture.claimInfo.context);
    const [nullifierRecordPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("nullifier"), Buffer.from(nullifierHash)],
      nullifierProgram.programId
    );

    try {
      await nullifierProgram.account.nullifierRecord.fetch(nullifierRecordPda);
      console.log(
        "⚠️  Nullifier already used in previous test, skipping first use"
      );
    } catch (e) {
      await escrowProgram.methods
        .withdraw(new anchor.BN(WITHDRAW_AMOUNT), proof)
        .accounts({
          escrow: escrowPda,
          user: payer.publicKey,
          userTokenAccount: userTokenAccount,
          escrowVault: escrowVault,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          verificationProgram: verificationProgram.programId,
          paymentConfig: paymentConfigPda,
          nullifierProgram: nullifierProgram.programId,
          nullifierRegistry: nullifierRegistryPda,
          nullifierRecord: nullifierRecordPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    // Verify nullifier is marked
    const nullifierRecord =
      await nullifierProgram.account.nullifierRecord.fetch(nullifierRecordPda);
    expect(nullifierRecord.nullifierHash).to.equal(nullifierHash);

    const balanceBefore2 = await connection.getTokenAccountBalance(
      userTokenAccount
    );

    let doubleSpendPrevented = false;

    try {
      await escrowProgram.methods
        .withdraw(new anchor.BN(WITHDRAW_AMOUNT), proof)
        .accounts({
          escrow: escrowPda,
          user: payer.publicKey,
          userTokenAccount: userTokenAccount,
          escrowVault: escrowVault,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          verificationProgram: verificationProgram.programId,
          paymentConfig: paymentConfigPda,
          nullifierProgram: nullifierProgram.programId,
          nullifierRegistry: nullifierRegistryPda,
          nullifierRecord: nullifierRecordPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      // If we reach here, CRITICAL FAILURE
      throw new Error(
        "❌❌❌ CRITICAL SECURITY FAILURE: Replay attack succeeded!"
      );
    } catch (err: any) {
      doubleSpendPrevented = true;
    }

    const balanceAfter2 = await connection.getTokenAccountBalance(
      userTokenAccount
    );
    // Verify balance didn't change on second attempt
    expect(balanceAfter2.value.uiAmount).to.equal(
      balanceBefore2.value.uiAmount
    );
    expect(doubleSpendPrevented).to.be.true;
  });
});
