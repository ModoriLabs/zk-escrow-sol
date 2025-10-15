use crate::errors::*;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak::{hash as keccak_256, HASH_BYTES};
use anchor_lang::solana_program::secp256k1_recover::secp256k1_recover;

/// Prepare message for verification by adding Ethereum Signed Message prefix
/// Matches ethers.js hashMessage() behavior
///
/// Format: "\x19Ethereum Signed Message:\n{length}{content}"
/// Then hash with Keccak256
pub fn hash_ethereum_message(content: &str) -> [u8; HASH_BYTES] {
    let message = [
        "\x19Ethereum Signed Message:\n",
        &content.len().to_string(),
        content,
    ]
    .join("");

    keccak_256(message.as_bytes()).to_bytes()
}

/// Recover Ethereum address from message hash and signature
///
/// # Arguments
/// * `hash` - Keccak256 hash of the message (32 bytes)
/// * `signature` - ECDSA signature (65 bytes: r(32) + s(32) + v(1))
///
/// # Returns
/// * Ethereum address as hex string with "0x" prefix (e.g., "0xabcd...")
pub fn recover_signer_address(hash: &[u8; 32], signature: &[u8; 65]) -> Result<String> {
    // Extract recovery ID from v value
    // Ethereum uses v = 27 or 28, Solana expects 0 or 1
    require!(signature[64] >= 27, Secp256k1Error::InvalidRecoveryId);

    let recovery_id = signature[64]
        .checked_sub(27)
        .ok_or(Secp256k1Error::InvalidRecoveryId)?;

    require!(recovery_id <= 1, Secp256k1Error::InvalidRecoveryId);

    // Extract r and s from signature (first 64 bytes)
    let signature_data = &signature[0..64];

    // Recover public key using secp256k1_recover
    let public_key = secp256k1_recover(hash, recovery_id, signature_data)
        .map_err(|_| Secp256k1Error::RecoveryFailed)?;

    // Convert public key to Ethereum address
    // 1. Hash the public key with Keccak256
    let public_key_hash = keccak_256(&public_key.to_bytes()).to_bytes();

    // 2. Take last 20 bytes (Ethereum address is rightmost 160 bits)
    let address_bytes = &public_key_hash[12..];

    // 3. Convert to hex string with "0x" prefix
    let address = format!("0x{}", hex::encode(address_bytes));

    Ok(address)
}
