import { expect } from "chai";
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

describe("verify proof.json (static proof)", () => {
  let proof: ReturnType<typeof loadProof>;
  let wallet: Wallet;
  let serializedMessage: string;
  let identifier: string;

  before(() => {
    if (!WITNESS_PRIVATE_KEY) {
      throw new Error("WITNESS_PRIVATE_KEY not found in .env file");
    }

    // Load proof data
    proof = loadProof();

    // Calculate identifier
    identifier = hashClaimInfo(proof.claimInfo);

    // Serialize claim data
    serializedMessage = serialiseClaimData(proof.signedClaim.claim);

    // Create wallet from private key
    wallet = new Wallet(WITNESS_PRIVATE_KEY);
  });

  it("computes correct claim identifier from claimInfo", () => {
    // console.log("\n📝 Claim identifier verification:");
    // console.log("  Computed:", identifier);
    // console.log("  Expected:", proof.signedClaim.claim.identifier);

    expect(identifier.toLowerCase()).to.equal(
      proof.signedClaim.claim.identifier.toLowerCase()
    );
  });

  it("serializes claim data correctly", () => {
    // console.log("\n📝 Serialized claim data:");
    // console.log(serializedMessage);
    // console.log("\n📏 Message length:", serializedMessage.length, "bytes");

    expect(serializedMessage).to.be.a("string");
    expect(serializedMessage.length).to.be.greaterThan(0);
  });

  it("wallet address matches expected witness", () => {
    // console.log("\n🔑 Wallet verification:");
    // console.log("  Wallet address:", wallet.address);
    // console.log("  Expected witness:", proof.expectedWitness);

    expect(wallet.address.toLowerCase()).to.equal(
      proof.expectedWitness.toLowerCase()
    );
  });

  it("generates signature matching the fixture", async () => {
    // console.log("\n✍️  Signing message with private key...");
    const generatedSignature = await wallet.signMessage(serializedMessage);
    const originalSignature = proof.signedClaim.signatures[0];

    // console.log("🔍 Signature comparison:");
    // console.log("  Original:  ", originalSignature);
    // console.log("  Generated: ", generatedSignature);

    expect(generatedSignature.toLowerCase()).to.equal(
      originalSignature.toLowerCase()
    );
    // console.log("✅ Signatures match!");
  });

  it("signature recovers to expected witness address", () => {
    console.log("\n🔐 Verifying signature recovery:");
    const originalSignature = proof.signedClaim.signatures[0];

    const recoveredAddress = verifyMessage(
      serializedMessage,
      originalSignature
    );

    // console.log("  Recovered address:", recoveredAddress);
    // console.log("  Expected witness: ", proof.expectedWitness);

    expect(recoveredAddress.toLowerCase()).to.equal(
      proof.expectedWitness.toLowerCase()
    );
    // console.log("✅ Recovered address matches expected witness!");
  });

  it("uses correct Ethereum Signed Message format", () => {
    console.log("\n📋 Ethereum Signed Message format:");
    const prefix = "\x19Ethereum Signed Message:\n";
    const fullMessage = prefix + serializedMessage.length + serializedMessage;

    // console.log("  Prefix:", JSON.stringify(prefix));
    // console.log("  Length:", serializedMessage.length);
    // console.log("  Full message (what gets hashed):");
    // console.log("  ", JSON.stringify(fullMessage));

    expect(fullMessage).to.include(prefix);
    expect(fullMessage).to.include(serializedMessage);
  });
});
