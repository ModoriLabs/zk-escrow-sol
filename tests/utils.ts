import { Wallet, hashMessage, getBytes } from "ethers";

/**
 * Create a test Ethereum wallet
 */
export function createTestWallet(): Wallet {
  return Wallet.createRandom();
}

/**
 * Sign a message with Ethereum wallet
 * Returns signature in compact format (65 bytes: r + s + v)
 */
export async function signTestMessage(
  wallet: Wallet,
  message: string
): Promise<string> {
  return await wallet.signMessage(message);
}

/**
 * Serialize signature from hex string to Uint8Array (65 bytes)
 * Format: [r (32 bytes), s (32 bytes), v (1 byte)]
 */
export function serializeSignature(signatureHex: string): number[] {
  const bytes = getBytes(signatureHex);
  if (bytes.length !== 65) {
    throw new Error(`Invalid signature length: ${bytes.length}`);
  }
  return Array.from(bytes);
}

/**
 * Get Ethereum message hash (what gets signed)
 * Prepends "\x19Ethereum Signed Message:\n{length}"
 */
export function getMessageHash(message: string): string {
  return hashMessage(message);
}

/**
 * Extract recovery ID from signature
 */
export function getRecoveryId(signatureBytes: number[]): number {
  if (signatureBytes.length !== 65) {
    throw new Error("Invalid signature length");
  }
  const v = signatureBytes[64];
  // Ethereum uses 27/28, Solana secp256k1_recover expects 0/1
  return v - 27;
}
