import { readFileSync } from "fs";
import path from "path";
import {
  Wallet,
  hashMessage,
  getBytes,
  HDNodeWallet,
  keccak256,
  toUtf8Bytes,
} from "ethers";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ZkEscrowSol } from "../target/types/zk_escrow_sol";

export interface ClaimInfo {
  provider: string;
  parameters: string;
  context: string;
}

export interface CompleteClaimData {
  identifier: string;
  owner: string;
  timestampS: number;
  epoch: number;
}

export interface SignedClaim {
  claim: CompleteClaimData;
  signatures: string[];
}

export interface Proof {
  claimInfo: ClaimInfo;
  signedClaim: SignedClaim;
  isAppclipProof: boolean;
  expectedWitness: string;
}

/**
 * Create a test Ethereum wallet
 */
export function createTestWallet(): HDNodeWallet {
  return Wallet.createRandom();
}

/**
 * Sign a message with Ethereum wallet
 * Returns signature in compact format (65 bytes: r + s + v)
 */
export async function signMessage(
  wallet: HDNodeWallet,
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

/**
 * Load claim proof fixture used for integration tests
 */
export function loadProof(): Proof {
  const fixturePath = path.join(__dirname, "fixtures", "proof.json");
  const contents = readFileSync(fixturePath, "utf-8");
  return JSON.parse(contents) as Proof;
}

/**
 * Load simple proof fixture with short parameters (suitable for Solana transaction size limits)
 */
export function loadSimpleProof(): Proof {
  const fixturePath = path.join(__dirname, "fixtures", "simple-proof.json");
  const contents = readFileSync(fixturePath, "utf-8");
  return JSON.parse(contents) as Proof;
}

/**
 * Serialize claim data to match Solidity's Claims.serialise() format
 * Format: identifier + "\n" + owner + "\n" + timestampS + "\n" + epoch
 *
 * Matches zk-escrow implementation:
 * - identifier: hex string (already in 0x format)
 * - owner: address string (lowercase)
 * - timestampS: decimal string
 * - epoch: decimal string
 */
export function serialiseClaimData(claimData: CompleteClaimData): string {
  return [
    claimData.identifier, // Already in 0x... format
    claimData.owner.toLowerCase(), // Normalize to lowercase
    claimData.timestampS.toString(),
    claimData.epoch.toString(),
  ].join("\n");
}

// ok
export function hashClaimInfo(claimInfo: ClaimInfo) {
  const str = [
    claimInfo.provider,
    "\n",
    claimInfo.parameters,
    "\n",
    claimInfo.context,
  ].join("");
  return keccak256(toUtf8Bytes(str));
}

/**
 * Get Program instance with latest IDL
 * Note: anchor.workspace sometimes has stale IDL cache, so we load directly from file
 */
export function getProgram(): Program<ZkEscrowSol> {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load IDL directly to ensure we have the latest version
  const idlPath = path.join(__dirname, "../target/idl/zk_escrow_sol.json");
  const idl = JSON.parse(readFileSync(idlPath, "utf-8"));
  const programId = new anchor.web3.PublicKey(idl.metadata.address);

  return new Program<ZkEscrowSol>(idl as any, programId, provider);
}

/**
 * Get TokenEscrow Program instance
 */
export function getTokenEscrowProgram(): Program<any> {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load IDL directly
  const idlPath = path.join(__dirname, "../target/idl/token_escrow.json");
  const idl = JSON.parse(readFileSync(idlPath, "utf-8"));
  const programId = new anchor.web3.PublicKey(idl.metadata.address);

  return new Program(idl as any, programId, provider);
}

/**
 * Get NullifierRegistry Program instance
 */
export function getNullifierProgram(): Program<any> {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load IDL directly
  const idlPath = path.join(__dirname, "../target/idl/nullifier_registry.json");
  const idl = JSON.parse(readFileSync(idlPath, "utf-8"));
  const programId = new anchor.web3.PublicKey(idl.metadata.address);

  return new Program(idl as any, programId, provider);
}

/**
 * Calculate deterministic nullifier hash from proof context
 * Must match on-chain calculation: keccak256(senderNickname + transactionDate)
 */
export function calculateNullifier(context: string): string {
  const parsed = JSON.parse(context);
  const params = parsed.extractedParameters;

  if (!params.senderNickname) {
    throw new Error("Missing senderNickname in context");
  }
  if (!params.transactionDate) {
    throw new Error("Missing transactionDate in context");
  }

  // Create nullifier data (same as on-chain)
  const nullifierData = `${params.senderNickname}${params.transactionDate}`;

  // Hash using keccak256
  const hash = keccak256(toUtf8Bytes(nullifierData));

  // Take first 16 bytes (32 hex chars) to stay within 32 byte limit
  return hash.slice(2, 34); // Remove "0x" and take 32 chars
}
