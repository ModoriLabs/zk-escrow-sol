import { expect } from "chai";
import {
  createTestWallet,
  signTestMessage,
  serializeSignature,
  getMessageHash,
  getRecoveryId,
} from "./utils";

describe("secp256k1-test", () => {
  // Skip Anchor setup for now - we'll add it when we test on-chain
  // anchor.setProvider(anchor.AnchorProvider.env());
  // const program = anchor.workspace.Secp256k1Test as Program<Secp256k1Test>;

  describe("Off-chain: Ethereum signature generation", () => {
    it("should generate valid Ethereum signature", async () => {
      // 1. Create Ethereum wallet
      const wallet = createTestWallet();
      const address = wallet.address;

      console.log("Wallet address:", address);

      // 2. Define test message
      const message = "Hello, Solana!";

      // 3. Sign message
      const signature = await signTestMessage(wallet, message);

      console.log("Signature:", signature);

      // 4. Verify signature format (65 bytes)
      const signatureBytes = serializeSignature(signature);
      expect(signatureBytes).to.have.lengthOf(65);

      // 5. Verify recovery ID is valid (0 or 1)
      const recoveryId = getRecoveryId(signatureBytes);
      expect(recoveryId).to.be.oneOf([0, 1]);

      console.log("Recovery ID:", recoveryId);

      // 6. Verify message hash format
      const messageHash = getMessageHash(message);
      expect(messageHash).to.match(/^0x[0-9a-f]{64}$/);

      console.log("Message hash:", messageHash);
    });

    it("should match ethers hashMessage format", async () => {
      const message = "Test message";
      const messageHash = getMessageHash(message);

      // Ethers prepends "\x19Ethereum Signed Message:\n{length}" before hashing
      console.log("Message:", message);
      console.log("Message length:", message.length);
      console.log("Hashed message:", messageHash);

      // This hash should match what we'll implement on-chain
      expect(messageHash).to.be.a("string");
      expect(messageHash.startsWith("0x")).to.be.true;
    });

    it("should produce consistent signatures", async () => {
      const wallet = createTestWallet();
      const message = "Consistent test";

      const sig1 = await signTestMessage(wallet, message);
      const sig2 = await signTestMessage(wallet, message);

      // Signatures should be deterministic for same wallet and message
      expect(sig1).to.equal(sig2);
    });
  });

  // This test will fail until we implement the on-chain verification
  describe("On-chain: Signature verification", () => {
    it.skip("should verify Ethereum signature on Solana", async () => {
      // TODO: Implement after Phase 3-5
      // This is our integration test target
    });
  });
});
