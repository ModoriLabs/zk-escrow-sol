import { Wallet, keccak256, toUtf8Bytes } from "ethers";
import { writeFileSync } from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// generate proof without 'parameters'
async function generateProof() {
  // Get witness private key from environment
  const privateKey = process.env.WITNESS_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("WITNESS_PRIVATE_KEY not found in .env file");
  }

  const wallet = new Wallet(privateKey);
  console.log("Witness address:", wallet.address);

  // 1. Create ClaimInfo (similar to proof.json but without parameters)
  const claimInfo = {
    provider: "http",
    context: JSON.stringify({
      extractedParameters: {
        documentTitle: "송금확인증",
        receivingBankAccount: "59733704003503(KB국민은행)",
        recipientName: "이영분(부동산임대)",
        senderNickname: "609호이현민",
        transactionAmount: "-8,750",
        transactionDate: "2025-06-17 22:08:30",
      },
      providerHash:
        "0xffb501528259e6d684e1c2153fbbacab453fe9c97c336dc4f8f48d70a0e2a13d",
    }),
  };

  // 2. Calculate identifier (hash of provider + context, NO parameters)
  const claimInfoStr = [claimInfo.provider, "\n", claimInfo.context].join("");
  const identifier = keccak256(toUtf8Bytes(claimInfoStr));

  console.log("\n📝 ClaimInfo (without parameters):");
  console.log("  Provider:", claimInfo.provider);
  console.log("  Context length:", claimInfo.context.length, "bytes");
  console.log("\n🔑 Computed identifier:", identifier);

  // 3. Create claim data
  const owner = "0xf9f25d1b846625674901ace47d6313d1ac795265";
  const timestampS = 1750832369;
  const epoch = 1;

  // 4. Serialize claim data for signing
  const claimMessage = [
    identifier,
    owner.toLowerCase(),
    timestampS.toString(),
    epoch.toString(),
  ].join("\n");

  console.log("\n📄 Claim message to sign:");
  console.log(claimMessage);

  // 5. Sign the claim message
  const signature = await wallet.signMessage(claimMessage);

  console.log("\n✍️  Signature:", signature);

  // 6. Create the proof structure
  const proof = {
    claimInfo,
    signedClaim: {
      claim: {
        identifier,
        owner,
        timestampS,
        epoch,
      },
      signatures: [signature],
    },
    isAppclipProof: false,
    expectedWitness: wallet.address,
  };

  // 7. Save to file
  const outputPath = path.join(__dirname, "..", "fixtures", "proof2.json");
  writeFileSync(outputPath, JSON.stringify(proof, null, 2));

  console.log("\n✅ Proof saved to:", outputPath);
  console.log("\n📊 Summary:");
  console.log(
    "  - Identifier calculated from: provider + context (NO parameters)"
  );
  console.log("  - Context size:", claimInfo.context.length, "bytes");
  console.log("  - Expected witness:", wallet.address);
}

generateProof().catch((error) => {
  console.error("\n❌ Error:", error.message);
  process.exit(1);
});
