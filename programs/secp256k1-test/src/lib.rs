use anchor_lang::prelude::*;

mod errors;
mod utils;

use errors::*;
use utils::*;

declare_id!("A8oUCtSKbVxthxxLiWNWnRBjhZYpJen2zC2wHGWrSqYb");

#[program]
pub mod secp256k1_test {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }

    /// Verify Ethereum ECDSA signature on Solana
    ///
    /// # Arguments
    /// * `message` - The original message that was signed
    /// * `signature` - 65-byte ECDSA signature (r + s + v)
    /// * `expected_address` - Expected Ethereum address (with 0x prefix)
    ///
    /// # Errors
    /// * `InvalidSignature` - Signature format is invalid
    /// * `InvalidRecoveryId` - Recovery ID is not 0 or 1
    /// * `RecoveryFailed` - Failed to recover public key
    /// * `AddressMismatch` - Recovered address doesn't match expected
    pub fn verify_signature(
        _ctx: Context<VerifySignature>,
        message: String,
        signature: Vec<u8>,
        expected_address: String,
    ) -> Result<()> {
        msg!("Verifying signature for message: {}", message);
        msg!("Expected address: {}", expected_address);

        // 1. Validate signature format (must be 65 bytes)
        require!(signature.len() == 65, Secp256k1Error::InvalidSignature);

        // 2. Convert signature Vec to array
        let mut sig_array = [0u8; 65];
        sig_array.copy_from_slice(&signature);

        // 3. Prepare message hash (Ethereum Signed Message format)
        let message_hash = hash_ethereum_message(&message);

        msg!("Message hash: {:?}", hex::encode(message_hash));

        // 4. Recover signer address from signature
        let recovered_address = recover_signer_address(&message_hash, &sig_array)?;

        msg!("Recovered address: {}", recovered_address);

        // 5. Compare recovered address with expected address (case-insensitive)
        require!(
            recovered_address.to_lowercase() == expected_address.to_lowercase(),
            Secp256k1Error::AddressMismatch
        );

        msg!("✅ Signature verified successfully!");

        Ok(())
    }

    /// Verify a signed claim by recreating the serialised message and recovering signer address
    pub fn verify_signed_claim(
        _ctx: Context<VerifySignedClaim>,
        claim: ClaimDataInput,
        signature: Vec<u8>,
        expected_witness: String,
    ) -> Result<()> {
        require!(signature.len() == 65, Secp256k1Error::InvalidSignature);

        // Validate identifier/owner formatting
        let identifier_bytes = hex_str_to_bytes(&claim.identifier)?;
        require!(
            identifier_bytes.len() == 32,
            Secp256k1Error::IdentifierMismatch
        );

        let owner_bytes = hex_str_to_bytes(&claim.owner)?;
        require!(owner_bytes.len() == 20, Secp256k1Error::InvalidHex);

        let mut sig_array = [0u8; 65];
        sig_array.copy_from_slice(&signature);

        let message = serialise_claim_data(
            &claim.identifier,
            &claim.owner,
            claim.timestamp_s,
            claim.epoch,
        );

        msg!("Serialised claim message: {}", message);

        let message_hash = hash_ethereum_message(&message);
        let recovered_address = recover_signer_address(&message_hash, &sig_array)?;

        msg!("Recovered witness: {}", recovered_address);
        msg!("Expected witness: {}", expected_witness);

        require!(
            recovered_address.eq_ignore_ascii_case(&expected_witness),
            Secp256k1Error::AddressMismatch
        );

        Ok(())
    }

    /// Verify proof signatures (zk-escrow compatible)
    ///
    /// This function verifies a complete proof structure including:
    /// 1. Claim identifier matches hash of claim info
    /// 2. Signatures are valid and recover to expected witnesses
    /// 3. At least `required_threshold` valid witness signatures exist
    ///
    /// # Arguments
    /// * `proof` - Complete proof containing claim_info and signed_claim
    /// * `expected_witnesses` - List of valid witness addresses
    /// * `required_threshold` - Minimum number of valid signatures required
    pub fn verify_proof_signatures(
        _ctx: Context<VerifyProofSignatures>,
        proof: Proof,
        expected_witnesses: Vec<String>,
        required_threshold: u8,
    ) -> Result<()> {
        msg!("=== Starting Proof Verification ===");
        msg!("Required threshold: {}", required_threshold);
        msg!("Expected witnesses: {:?}", expected_witnesses);

        // 1. Verify required_threshold is valid
        require!(required_threshold > 0, Secp256k1Error::InvalidSignature);
        require!(
            (required_threshold as usize) <= expected_witnesses.len(),
            Secp256k1Error::InvalidSignature
        );
        require!(
            proof.signed_claim.signatures.len() > 0,
            Secp256k1Error::InvalidSignature
        );

        // 2. Verify claim identifier matches hash of claim info
        let computed_identifier = hash_claim_info(
            &proof.claim_info.provider,
            &proof.claim_info.parameters,
            &proof.claim_info.context,
        );
        let computed_identifier_str = format!("0x{}", hex::encode(computed_identifier));

        msg!("Computed identifier: {}", computed_identifier_str);
        msg!("Expected identifier: {}", proof.signed_claim.claim.identifier);

        require!(
            computed_identifier_str.eq_ignore_ascii_case(&proof.signed_claim.claim.identifier),
            Secp256k1Error::IdentifierMismatch
        );

        // 3. Serialize claim data for signature verification
        let claim_message = serialise_claim_data(
            &proof.signed_claim.claim.identifier,
            &proof.signed_claim.claim.owner,
            proof.signed_claim.claim.timestamp_s,
            proof.signed_claim.claim.epoch,
        );

        msg!("Claim message: {}", claim_message);

        let message_hash = hash_ethereum_message(&claim_message);

        // 4. Recover signers from each signature and count valid witnesses
        let mut valid_witness_count: u8 = 0;
        let mut seen_witnesses: Vec<String> = Vec::new();

        for (i, signature) in proof.signed_claim.signatures.iter().enumerate() {
            msg!("Processing signature {}", i);

            // Validate signature format
            if signature.len() != 65 {
                msg!("⚠️  Signature {} has invalid length, skipping", i);
                continue;
            }

            let mut sig_array = [0u8; 65];
            sig_array.copy_from_slice(signature);

            // Recover signer address
            let recovered_address = match recover_signer_address(&message_hash, &sig_array) {
                Ok(addr) => addr,
                Err(_) => {
                    msg!("⚠️  Failed to recover address from signature {}, skipping", i);
                    continue;
                }
            };

            msg!("Recovered address from signature {}: {}", i, recovered_address);

            // Check if this witness was already counted (prevent duplicate counting)
            let already_seen = seen_witnesses
                .iter()
                .any(|w| w.eq_ignore_ascii_case(&recovered_address));

            if already_seen {
                msg!("⚠️  Witness {} already counted, skipping", recovered_address);
                continue;
            }

            // Check if recovered address is in expected witnesses list
            let is_valid_witness = expected_witnesses
                .iter()
                .any(|w| w.eq_ignore_ascii_case(&recovered_address));

            if is_valid_witness {
                msg!("✅ Valid witness found: {}", recovered_address);
                seen_witnesses.push(recovered_address);
                valid_witness_count += 1;
            } else {
                msg!("⚠️  Recovered address {} is not an expected witness", recovered_address);
            }
        }

        msg!("Valid witness signatures: {}/{}", valid_witness_count, required_threshold);

        // 5. Check if we have enough valid witness signatures
        require!(
            valid_witness_count >= required_threshold,
            Secp256k1Error::AddressMismatch
        );

        msg!("✅ Proof verification successful!");

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}

#[derive(Accounts)]
pub struct VerifySignature {}

#[derive(Accounts)]
pub struct VerifyClaimIdentifier {}

#[derive(Accounts)]
pub struct VerifySignedClaim {}

#[derive(Accounts)]
pub struct VerifyProofSignatures {}

// ============================================================================
// Data Structures (zk-escrow compatible)
// ============================================================================

/// Claim information containing provider, parameters, and context
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ClaimInfo {
    pub provider: String,
    pub parameters: String,
    pub context: String,
}

/// Complete claim data with identifier, owner, timestamp, and epoch
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ClaimDataInput {
    pub identifier: String,
    pub owner: String,
    pub timestamp_s: u32,
    pub epoch: u32,
}

/// Signed claim containing claim data and signatures
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SignedClaim {
    pub claim: ClaimDataInput,
    pub signatures: Vec<Vec<u8>>, // Multiple signatures supported
}

/// Complete proof structure (zk-escrow compatible)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct Proof {
    pub claim_info: ClaimInfo,
    pub signed_claim: SignedClaim,
}
