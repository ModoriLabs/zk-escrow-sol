import { Wallet, verifyMessage } from "ethers";
import { hashClaimInfo, loadProof, serialiseClaimData } from "./utils";
import dotenv from "dotenv";

dotenv.config();
/**
 * Test to verify that the signature in proof.json matches the serialized claim data
 *
 * This test checks:
 * 1. Serialize claim data using the same format as Solidity
 * 2. Sign the serialized message with a private key
 * 3. Compare the generated signature with the signature in proof.json
 * 4. Verify the recovered address matches expectedWitness
 */

const WITNESS_PRIVATE_KEY = process.env.WITNESS_PRIVATE_KEY;

async function main() {
  console.log("=== Proof Signature Verification Test ===\n");

  // Load proof data
  const proof = loadProof();
  console.log("📄 Loaded proof data:");
  console.log("  - Claim identifier:", proof.signedClaim.claim.identifier);
  console.log("  - Owner:", proof.signedClaim.claim.owner);
  console.log("  - Timestamp:", proof.signedClaim.claim.timestampS);
  console.log("  - Epoch:", proof.signedClaim.claim.epoch);
  console.log("  - Expected witness:", proof.expectedWitness);
  console.log("  - Signature:", proof.signedClaim.signatures[0]);
  console.log();

  const identifier = hashClaimInfo(proof.claimInfo);

  console.log("📝 Claim identifier:", identifier);
  console.log("   Expected identifier:", proof.signedClaim.claim.identifier);
  console.log();

  // Serialize claim data
  const serializedMessage = serialiseClaimData(proof.signedClaim.claim);
  console.log("📝 Serialized claim data:");
  console.log(serializedMessage);
  console.log();
  console.log("📏 Message length:", serializedMessage.length, "bytes");
  console.log();

  // Create wallet from private key
  const wallet = new Wallet(WITNESS_PRIVATE_KEY);
  console.log("🔑 Wallet address:", wallet.address);
  console.log();

  // Sign the serialized message
  console.log("✍️  Signing message with private key...");
  const generatedSignature = await wallet.signMessage(serializedMessage);
  console.log("  Generated signature:", generatedSignature);
  console.log();

  // Compare signatures
  const originalSignature = proof.signedClaim.signatures[0];
  console.log("🔍 Signature comparison:");
  console.log("  Original:  ", originalSignature);
  console.log("  Generated: ", generatedSignature);
  console.log();

  if (generatedSignature.toLowerCase() === originalSignature.toLowerCase()) {
    console.log("✅ SUCCESS: Signatures match!");
    console.log(
      "   This confirms the claim was signed by the wallet with the provided private key."
    );
  } else {
    console.log("❌ FAILED: Signatures do not match");
    console.log(
      "   Either the private key is incorrect or the serialization format is different."
    );
  }
  console.log();

  // Verify the signature recovers to expected witness address
  console.log("🔐 Verifying signature recovery:");
  try {
    const recoveredAddress = verifyMessage(
      serializedMessage,
      originalSignature
    );
    console.log("  Recovered address:", recoveredAddress);
    console.log("  Expected witness: ", proof.expectedWitness);
    console.log();

    if (
      recoveredAddress.toLowerCase() === proof.expectedWitness.toLowerCase()
    ) {
      console.log("✅ SUCCESS: Recovered address matches expected witness!");
      console.log(
        "   The signature is valid and was created by:",
        recoveredAddress
      );
    } else {
      console.log(
        "❌ FAILED: Recovered address does not match expected witness"
      );
      console.log("   Recovered:", recoveredAddress);
      console.log("   Expected: ", proof.expectedWitness);
    }
  } catch (error) {
    console.error("❌ ERROR: Failed to recover signer address:", error);
  }
  console.log();

  // Additional: Show what the Ethereum Signed Message format looks like
  console.log("📋 Ethereum Signed Message format:");
  const prefix = "\x19Ethereum Signed Message:\n";
  const fullMessage = prefix + serializedMessage.length + serializedMessage;
  console.log("  Prefix:", JSON.stringify(prefix));
  console.log("  Length:", serializedMessage.length);
  console.log("  Full message (what gets hashed):");
  console.log("  ", JSON.stringify(fullMessage));
}

main()
  .then(() => {
    console.log("\n=== Test completed ===");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  });
