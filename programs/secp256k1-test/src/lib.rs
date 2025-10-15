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
}

#[derive(Accounts)]
pub struct Initialize {}

#[derive(Accounts)]
pub struct VerifySignature {}

#[derive(Accounts)]
pub struct VerifyClaimIdentifier {}

#[derive(Accounts)]
pub struct VerifySignedClaim {}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ClaimDataInput {
    pub identifier: String,
    pub owner: String,
    pub timestamp_s: u32,
    pub epoch: u32,
}
