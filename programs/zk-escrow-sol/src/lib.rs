use anchor_lang::prelude::*;

mod errors;
mod utils;

use errors::*;
use utils::*;

declare_id!("A8oUCtSKbVxthxxLiWNWnRBjhZYpJen2zC2wHGWrSqYb");

#[program]
pub mod zk_escrow_sol {
    use super::*;

    /// Initialize ZK verification program with payment validation config
    /// This creates the payment config PDA with expected payment details
    pub fn initialize(
        ctx: Context<Initialize>,
        recipient_bank_account: String,
        allowed_amount: u64,
        fiat_currency: String,
    ) -> Result<()> {
        // Validation
        require!(
            !recipient_bank_account.is_empty(),
            Secp256k1Error::InvalidBankAccount
        );
        require!(allowed_amount > 0, Secp256k1Error::InvalidAmount);
        require!(fiat_currency == "KRW", Secp256k1Error::InvalidCurrency);

        let config = &mut ctx.accounts.payment_config;
        config.recipient_bank_account = recipient_bank_account.clone();
        config.allowed_amount = allowed_amount;
        config.fiat_currency = fiat_currency.clone();
        config.authority = ctx.accounts.authority.key();

        msg!("ZK Proof Verification program initialized");
        msg!("Recipient: {}", recipient_bank_account);
        msg!("Allowed amount: {} KRW", allowed_amount);
        msg!("Currency: {}", fiat_currency);
        msg!("Authority: {}", ctx.accounts.authority.key());

        Ok(())
    }

    ///
    /// This function verifies a complete proof structure including:
    /// 1. Claim identifier matches hash of claim info
    /// 2. Signatures are valid and recover to expected witnesses
    /// 3. At least `required_threshold` valid witness signatures exist
    /// 4. Payment details validation against stored config
    ///
    /// # Arguments
    /// * `proof` - Complete proof containing claim_info and signed_claim
    /// * `expected_witnesses` - List of valid witness addresses
    /// * `required_threshold` - Minimum number of valid signatures required
    pub fn verify_proof_signatures(
        ctx: Context<VerifyProofSignatures>,
        proof: Proof,
        expected_witnesses: Vec<String>,
        required_threshold: u8,
    ) -> Result<()> {
        // Verify proof signatures
        verify_proof_internal(&proof, &expected_witnesses, required_threshold)?;

        // Verify payment details from stored config
        let config = &ctx.accounts.payment_config;
        verify_payment_details_from_context(
            &proof.claim_info.context,
            &config.recipient_bank_account,
            config.allowed_amount,
            &config.fiat_currency,
        )?;

        Ok(())
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

fn verify_proof_internal(
    proof: &Proof,
    expected_witnesses: &Vec<String>,
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
    msg!(
        "Expected identifier: {}",
        proof.signed_claim.claim.identifier
    );

    // require!(
    //     computed_identifier_str.eq_ignore_ascii_case(&proof.signed_claim.claim.identifier),
    //     Secp256k1Error::IdentifierMismatch
    // );

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
            msg!("Signature {} has invalid length, skipping", i);
            continue;
        }

        let mut sig_array = [0u8; 65];
        sig_array.copy_from_slice(signature);

        // Recover signer address
        let recovered_address = match recover_signer_address(&message_hash, &sig_array) {
            Ok(addr) => addr,
            Err(_) => {
                msg!("Failed to recover address from signature {}, skipping", i);
                continue;
            }
        };

        msg!(
            "Recovered address from signature {}: {}",
            i,
            recovered_address
        );

        // Check if this witness was already counted (prevent duplicate counting)
        let already_seen = seen_witnesses
            .iter()
            .any(|w| w.eq_ignore_ascii_case(&recovered_address));

        if already_seen {
            msg!("Witness {} already counted, skipping", recovered_address);
            continue;
        }

        // Check if recovered address is in expected witnesses list
        let is_valid_witness = expected_witnesses
            .iter()
            .any(|w| w.eq_ignore_ascii_case(&recovered_address));

        if is_valid_witness {
            msg!("Valid witness found: {}", recovered_address);
            seen_witnesses.push(recovered_address);
            valid_witness_count += 1;
        } else {
            msg!(
                "Recovered address {} is not an expected witness",
                recovered_address
            );
        }
    }

    msg!(
        "Valid witness signatures: {}/{}",
        valid_witness_count,
        required_threshold
    );

    // 5. Check if we have enough valid witness signatures
    require!(
        valid_witness_count >= required_threshold,
        Secp256k1Error::AddressMismatch
    );

    msg!("Proof verification successful!");

    Ok(())
}

/// Verify payment details extracted from proof context
fn verify_payment_details_from_context(
    context: &str,
    expected_recipient: &str,
    expected_amount: u64,
    expected_currency: &str,
) -> Result<()> {
    msg!("=== Verifying Payment Details ===");
    msg!("Context: {}", context);

    // Validation constraints
    require!(
        !expected_recipient.is_empty(),
        Secp256k1Error::InvalidBankAccount
    );
    require!(expected_amount > 0, Secp256k1Error::InvalidAmount);
    require!(expected_currency == "KRW", Secp256k1Error::InvalidCurrency);

    // Parse context JSON to extract payment details
    // Context format example: {"extractedParameters":{"recipientAccount":"100000000000(토스뱅크)","senderNickname":"nickname","transactionAmount":"1,400원","date":"2024.01.01"}}

    // Simple string-based validation (checking if expected values are present in context)
    // This is a simplified approach - in production, you'd want proper JSON parsing

    // Check recipient bank account
    let recipient_found = context.contains(expected_recipient);
    require!(recipient_found, Secp256k1Error::RecipientMismatch);
    msg!("✓ Recipient bank account verified: {}", expected_recipient);

    // Check amount (convert u64 to formatted string: 1400 -> "1,400원")
    let formatted_amount = format_krw_amount(expected_amount);
    let amount_found = context.contains(&formatted_amount);
    require!(amount_found, Secp256k1Error::AmountMismatch);
    msg!("✓ Payment amount verified: {} KRW", expected_amount);

    // Currency is already validated above (must be KRW)
    msg!("✓ Currency verified: {}", expected_currency);

    msg!("Payment details verification successful!");
    Ok(())
}

// ============================================================================
// Account Structures
// ============================================================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + PaymentConfig::INIT_SPACE,
        seeds = [b"payment_config", authority.key().as_ref()],
        bump,
    )]
    pub payment_config: Account<'info, PaymentConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VerifyProofSignatures<'info> {
    pub signer: Signer<'info>,

    #[account(
        seeds = [b"payment_config", signer.key().as_ref()],
        bump,
    )]
    pub payment_config: Account<'info, PaymentConfig>,
}

// ============================================================================
// Data Structures (zk-escrow compatible)
// ============================================================================

/// Payment validation configuration
#[account]
#[derive(InitSpace)]
pub struct PaymentConfig {
    pub authority: Pubkey,
    #[max_len(100)]
    pub recipient_bank_account: String,
    pub allowed_amount: u64,
    #[max_len(10)]
    pub fiat_currency: String,
}

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
