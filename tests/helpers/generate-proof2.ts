import { Wallet, keccak256, toUtf8Bytes } from "ethers";
import { writeFileSync } from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// Generate proof2 using data from proof-data.txt
async function generateProof2() {
  // Get witness private key from environment
  const privateKey = process.env.WITNESS_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("WITNESS_PRIVATE_KEY not found in .env file");
  }

  const wallet = new Wallet(privateKey);
  console.log("Witness address:", wallet.address);

  // 1. Create ClaimInfo using data from proof-data.txt
  const claimInfo = {
    provider: "http",
    context: JSON.stringify({
      extractedParameters: {
        documentTitle: "송금확인증",
        receivingBankAccount: "100000021389(토스뱅크)",
        recipientName: "이현민",
        senderNickname: "anvil-1",
        transactionAmount: "-138",
        transactionDate: "2025-07-25 12:20:09",
      },
      providerHash:
        "0x039d7bbc8338d327d2956ee9de45cef167275ba83652ca9dc62b1219f0bcc937",
    }),
  };

  const parameters =
    '{"method":"GET","responseMatches":[{"type":"regex","value":"<table[^>]*class=\\"table table--vertical-align-top mt-16\\"[^>]*>.*?<tbody[^>]*class=\\"table__tbody-row\\"[^>]*>.*?<tr>.*?(?:<td[^>]*>[^<]*</td>\\\\s*){0}<td[^>]*>(?<transactionDate>[^<]+)</td>"},{"type":"regex","value":"<table[^>]*class=\\"table table--vertical-align-top mt-16\\"[^>]*>.*?<tbody[^>]*class=\\"table__tbody-row\\"[^>]*>.*?<tr>.*?(?:<td[^>]*>[^<]*</td>\\\\s*){1}<td[^>]*>(?<recipientName>[^<]+)</td>"},{"type":"regex","value":"<table[^>]*class=\\"table table--vertical-align-top mt-16\\"[^>]*>.*?<tbody[^>]*class=\\"table__tbody-row\\"[^>]*>.*?<tr>.*?(?:<td[^>]*>[^<]*</td>\\\\s*){3}<td[^>]*>(?<transactionAmount>[^<]+)</td>"},{"type":"regex","value":"<table[^>]*class=\\"table table--vertical-align-top mt-16\\"[^>]*>.*?<tbody[^>]*class=\\"table__tbody-row\\"[^>]*>.*?<tr>.*?(?:<td[^>]*>[^<]*</td>\\\\s*){5}<td[^>]*>(?<receivingBankAccount>[^<]+)</td>"},{"type":"regex","value":"<table[^>]*class=\\"table table--vertical-align-top mt-16\\"[^>]*>.*?<tbody[^>]*class=\\"table__tbody-row\\"[^>]*>.*?<tr>.*?(?:<td[^>]*>[^<]*</td>\\\\s*){6}<td[^>]*>(?<senderNickname>[^<]+)</td>"},{"type":"regex","value":"<h1[^>]*>(?<documentTitle>[^<]+)</h1>"}],"url":"https://api.tossbank.com/api-public/document/view/2025-07-28/2768-AMEH-GADCGTAG","writeRedactionMode":"zk"}';

  // 2. Calculate identifier (hash of provider + context, NO parameters)
  const claimInfoStr = [claimInfo.provider, "\n", claimInfo.context].join("");
  // const claimInfoStr = [
  //   claimInfo.provider,
  //   "\n",
  //   parameters,
  //   "\n",
  //   claimInfo.context,
  // ].join("");
  console.log("claimInfo.provider", claimInfo.provider);
  console.log("claimInfo.context", claimInfo.context);
  const identifier = keccak256(toUtf8Bytes(claimInfoStr));

  console.log("\n📝 ClaimInfo (without parameters):");
  console.log("  Provider:", claimInfo.provider);
  console.log("  Context length:", claimInfo.context.length, "bytes");
  console.log("\n🔑 Computed identifier:", identifier);

  // 3. Create claim data from proof-data.txt
  const owner = "0xf9f25d1b846625674901ace47d6313d1ac795265";
  const timestampS = 1760583047;
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

  // 7. Save to proof2.json
  const outputPath = path.join(__dirname, "..", "fixtures", "proof2.json");
  writeFileSync(outputPath, JSON.stringify(proof, null, 2));

  console.log("\n✅ Proof saved to:", outputPath);
  console.log("\n📊 Summary:");
  console.log(
    "  - Identifier calculated from: provider + context (NO parameters)"
  );
  console.log("  - Context size:", claimInfo.context.length, "bytes");
  console.log("  - Expected witness:", wallet.address);
  console.log("\n🔍 Data source: proof-data.txt");
  console.log("  - Different extractedParameters (토스뱅크, 이현민, -138)");
  console.log("  - Different timestampS:", timestampS);
}

generateProof2().catch((error) => {
  console.error("\n❌ Error:", error.message);
  process.exit(1);
});
