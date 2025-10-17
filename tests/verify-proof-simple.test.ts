import { expect } from "chai";
import { loadSimpleProof, getProgram, serializeSignature } from "./utils";

describe("verify_proof_signatures (simple proof)", () => {
  const program = getProgram();
  const fixture = loadSimpleProof();

  it("verifies a complete proof with valid witness signature", async () => {
    // Prepare proof structure matching our Solana types
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

    // Expected witnesses (single witness in our fixture)
    const expectedWitnesses = [fixture.expectedWitness];

    // Required threshold (at least 1 valid signature)
    const requiredThreshold = 1;

    console.log("Proof structure:");
    console.log("  - Provider:", proof.claimInfo.provider);
    console.log("  - Identifier:", proof.signedClaim.claim.identifier);
    console.log("  - Owner:", proof.signedClaim.claim.owner);
    console.log("  - Signatures:", proof.signedClaim.signatures.length);
    console.log("  - Expected witnesses:", expectedWitnesses);
    console.log("  - Required threshold:", requiredThreshold);

    // Call verify_proof_signatures
    const tx = await program.methods
      .verifyProofSignatures(proof, expectedWitnesses, requiredThreshold)
      .rpc();

    console.log("✅ Transaction signature:", tx);
    console.log("✅ Proof verified successfully!");
  });

  it("rejects proof when threshold is not met", async () => {
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

    // Wrong witness address
    const wrongWitnesses = ["0x0000000000000000000000000000000000000000"];
    const requiredThreshold = 1;

    try {
      await program.methods
        .verifyProofSignatures(proof, wrongWitnesses, requiredThreshold)
        .rpc();

      throw new Error("Expected transaction to fail but it succeeded");
    } catch (error: any) {
      console.log("✅ Transaction correctly rejected");
      expect(error.toString()).to.include("AddressMismatch");
    }
  });

  it("rejects proof with invalid identifier", async () => {
    const proof = {
      claimInfo: {
        provider: fixture.claimInfo.provider,
        parameters: fixture.claimInfo.parameters,
        context: fixture.claimInfo.context,
      },
      signedClaim: {
        claim: {
          identifier: "0xdeadbeef", // Wrong identifier
          owner: fixture.signedClaim.claim.owner,
          timestampS: fixture.signedClaim.claim.timestampS,
          epoch: fixture.signedClaim.claim.epoch,
        },
        signatures: fixture.signedClaim.signatures.map((sig) =>
          Buffer.from(serializeSignature(sig))
        ),
      },
    };

    const expectedWitnesses = [fixture.expectedWitness];
    const requiredThreshold = 1;

    try {
      await program.methods
        .verifyProofSignatures(proof, expectedWitnesses, requiredThreshold)
        .rpc();

      throw new Error("Expected transaction to fail but it succeeded");
    } catch (error: any) {
      console.log("✅ Transaction correctly rejected (invalid identifier)");
      // Note: Since identifier validation is disabled,
      // invalid identifier causes signature verification to fail
      expect(error.toString()).to.include("AddressMismatch");
    }
  });
});
