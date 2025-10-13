import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Secp256k1Test } from "../target/types/secp256k1_test";
import { expect } from "chai";
import { Wallet } from "ethers";
import {
  createTestWallet,
  signTestMessage,
  serializeSignature,
  getMessageHash,
  getRecoveryId,
} from "./utils";

describe("secp256k1-test", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Secp256k1Test as Program<Secp256k1Test>;

  describe("On-chain: Signature verification", () => {
    let wallet: Wallet;
    let message: string;
    let signature: string;
    let signatureBytes: number[];

    before(async () => {
      // Setup test data
      wallet = createTestWallet();
      message = "Hello, Solana!";
      signature = await signTestMessage(wallet, message);
      signatureBytes = serializeSignature(signature);

      console.log("\n=== Test Setup ===");
      console.log("Wallet address:", wallet.address);
      console.log("Message:", message);
      console.log("Signature:", signature);
      console.log("Signature bytes length:", signatureBytes.length);
    });

    it("should verify valid Ethereum signature on-chain", async () => {
      console.log("\n=== Running on-chain verification ===");

      try {
        const tx = await program.methods
          .verifySignature(message, Buffer.from(signatureBytes), wallet.address)
          .rpc();

        console.log("✅ Transaction signature:", tx);
        console.log("✅ Signature verified successfully on-chain!");
      } catch (error) {
        console.error("❌ Transaction failed:", error);
        throw error;
      }
    });

    it("should reject signature with wrong address", async () => {
      const wrongAddress = "0x0000000000000000000000000000000000000000";

      console.log("\n=== Testing wrong address rejection ===");
      console.log("Using wrong address:", wrongAddress);

      try {
        await program.methods
          .verifySignature(message, Buffer.from(signatureBytes), wrongAddress)
          .rpc();

        // Should not reach here
        throw new Error("Expected transaction to fail but it succeeded");
      } catch (error: any) {
        console.log("✅ Transaction correctly rejected");

        // Check error message contains AddressMismatch
        expect(error.toString()).to.include("AddressMismatch");
      }
    });

    it("should reject signature with wrong message", async () => {
      const wrongMessage = "Different message";

      console.log("\n=== Testing wrong message rejection ===");
      console.log("Using wrong message:", wrongMessage);

      try {
        await program.methods
          .verifySignature(
            wrongMessage,
            Buffer.from(signatureBytes),
            wallet.address
          )
          .rpc();

        // Should not reach here
        throw new Error("Expected transaction to fail but it succeeded");
      } catch (error: any) {
        console.log("✅ Transaction correctly rejected");

        // Should fail with AddressMismatch (recovered address won't match)
        expect(error.toString()).to.include("AddressMismatch");
      }
    });

    it("should reject invalid signature format", async () => {
      const invalidSignature = Buffer.from([1, 2, 3]); // Only 3 bytes

      console.log("\n=== Testing invalid signature format ===");
      console.log("Using invalid signature length:", invalidSignature.length);

      try {
        await program.methods
          .verifySignature(message, invalidSignature, wallet.address)
          .rpc();

        // Should not reach here
        throw new Error("Expected transaction to fail but it succeeded");
      } catch (error: any) {
        console.log("✅ Transaction correctly rejected");

        // Should fail with InvalidSignature
        expect(error.toString()).to.include("InvalidSignature");
      }
    });

    it("should handle multiple different signatures", async () => {
      console.log("\n=== Testing multiple different signatures ===");

      // Test with 3 different wallets and messages
      for (let i = 0; i < 3; i++) {
        const testWallet = createTestWallet();
        const testMessage = `Test message ${i}`;
        const testSignature = await signTestMessage(testWallet, testMessage);
        const testSigBytes = serializeSignature(testSignature);

        console.log(`\nTest ${i + 1}:`);
        console.log("  Address:", testWallet.address);
        console.log("  Message:", testMessage);

        const tx = await program.methods
          .verifySignature(
            testMessage,
            Buffer.from(testSigBytes),
            testWallet.address
          )
          .rpc();

        console.log("  ✅ Verified, tx:", tx);
      }
    });
  });
});
