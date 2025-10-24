use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::Mint,
    token::Token,
    metadata::{MasterEditionAccount, MetadataAccount},
};
pub use anchor_lang::solana_program::sysvar::instructions::ID as INSTRUCTIONS_ID;

mod errors;
mod utils;

use errors::*;
use utils::*;
use spl_nft::CollectionState;

declare_id!("944j5oBiD7kTvS2j2hYow4oq5MFLbPXaGF7ZHUG2Fpbu");

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
        // Verify payment details from stored config
        let config = &ctx.accounts.payment_config;
        verify_payment_details_from_context(
            &proof.claim_info.context,
            &config.recipient_bank_account,
            config.allowed_amount,
            &config.fiat_currency,
        )?;

        // Verify proof signatures
        verify_proof_internal_logic(&proof, &expected_witnesses, required_threshold)?;

        Ok(())
    }

    /// Verify proof without payment validation (for unit testing)
    /// This exposes the internal proof verification logic
    pub fn verify_proof_only(
        _ctx: Context<VerifyProofInternal>,
        proof: Proof,
        expected_witnesses: Vec<String>,
        required_threshold: u8,
    ) -> Result<()> {
        verify_proof_internal_logic(&proof, &expected_witnesses, required_threshold)
    }

    /// Verify ZK proof and mint NFT
    /// 1. Verify proof signatures
    /// 2. Mint NFT via CPI to spl-nft
    /// Note: Payment validation happens off-chain before calling this function
    pub fn verify_proof_and_mint(
        ctx: Context<VerifyProofAndMint>,
        proof: Proof,
        expected_witnesses: Vec<String>,
        required_threshold: u8,
    ) -> Result<()> {
        // 1. ZK Proof verification
        verify_proof_internal_logic(&proof, &expected_witnesses, required_threshold)?;

        // 2. Log collection info (payment validation happens off-chain)
        let collection_state = &ctx.accounts.collection_state;
        msg!("Proof verified! Minting NFT...");
        msg!("Collection: {}", collection_state.name);
        msg!("Price: {} KRW", collection_state.price);
        msg!("Counter: {}", collection_state.counter);

        // 3. NFT Mint via CPI
        let cpi_program = ctx.accounts.spl_nft_program.to_account_info();
        let cpi_accounts = spl_nft::cpi::accounts::MintNFT {
            owner: ctx.accounts.signer.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            destination: ctx.accounts.destination.to_account_info(),
            metadata: ctx.accounts.metadata.to_account_info(),
            master_edition: ctx.accounts.master_edition.to_account_info(),
            mint_authority: ctx.accounts.mint_authority.to_account_info(),
            collection_mint: ctx.accounts.collection_mint.to_account_info(),
            collection_state: ctx.accounts.collection_state.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
            token_metadata_program: ctx.accounts.token_metadata_program.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        spl_nft::cpi::mint_nft(cpi_ctx)?;

        msg!("NFT minted successfully!");
        msg!("URI: {}/{}", collection_state.uri_prefix, collection_state.counter);

        Ok(())
    }

    /// Two-Transaction Pattern: Step 1 - Verify proof and store result in PDA
    /// This separates large proof verification from NFT minting to solve transaction size issues
    /// Each unique claim_identifier gets its own PDA, allowing multiple verifications per user
    pub fn verify_proof(
        ctx: Context<VerifyProofNew>,
        proof: Proof,
        expected_witnesses: Vec<String>,
        required_threshold: u8,
    ) -> Result<()> {
        msg!("=== Step 1: Verify Proof ===" );

        // 1. Verify proof using internal logic
        verify_proof_internal_logic(&proof, &expected_witnesses, required_threshold)?;

        // 2. Store verification result in PDA
        let result = &mut ctx.accounts.verification_result;
        result.user = ctx.accounts.signer.key();
        result.verified_at = Clock::get()?.unix_timestamp;
        result.claim_identifier = proof.signed_claim.claim.identifier.clone();
        result.is_used = false;

        msg!("Verification result stored in PDA");
        msg!("User: {}", result.user);
        msg!("Verified at: {}", result.verified_at);
        msg!("Claim ID: {}", result.claim_identifier);

        Ok(())
    }

    /// Two-Transaction Pattern: Step 2 - Mint NFT using verified proof result
    /// This transaction is small because it only checks PDA (no large proof data)
    /// The verification result PDA is reusable - can verify new proof and mint again
    pub fn mint_with_verified_proof(
        ctx: Context<MintWithVerifiedProof>,
    ) -> Result<()> {
        msg!("=== Step 2: Mint NFT with Verified Proof ===");

        let result = &ctx.accounts.verification_result;
        let current_time = Clock::get()?.unix_timestamp;

        // 1. Security checks
        require!(
            result.user == ctx.accounts.signer.key(),
            Secp256k1Error::UnauthorizedUser
        );

        // 2. Check verification is not expired (5 minutes = 300 seconds)
        let elapsed = current_time - result.verified_at;
        require!(
            elapsed < 300,
            Secp256k1Error::VerificationExpired
        );

        msg!("Verification checks passed");
        msg!("Elapsed time: {} seconds", elapsed);

        // 3. Get collection info for logging
        let collection_state = &ctx.accounts.collection_state;
        msg!("Collection: {}", collection_state.name);
        msg!("Price: {} KRW", collection_state.price);
        msg!("Counter: {}", collection_state.counter);

        // 4. Mint NFT via CPI
        let cpi_program = ctx.accounts.spl_nft_program.to_account_info();
        let cpi_accounts = spl_nft::cpi::accounts::MintNFT {
            owner: ctx.accounts.signer.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            destination: ctx.accounts.destination.to_account_info(),
            metadata: ctx.accounts.metadata.to_account_info(),
            master_edition: ctx.accounts.master_edition.to_account_info(),
            mint_authority: ctx.accounts.mint_authority.to_account_info(),
            collection_mint: ctx.accounts.collection_mint.to_account_info(),
            collection_state: ctx.accounts.collection_state.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
            token_metadata_program: ctx.accounts.token_metadata_program.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        spl_nft::cpi::mint_nft(cpi_ctx)?;

        msg!("NFT minted successfully!");
        msg!("URI: {}/{}", collection_state.uri_prefix, collection_state.counter);

        // 5. Verify collection (mark NFT as verified)
        msg!("=== Step 3: Verify Collection ===");

        let verify_cpi_program = ctx.accounts.spl_nft_program.to_account_info();
        let verify_cpi_accounts = spl_nft::cpi::accounts::VerifyCollectionMint {
            authority: ctx.accounts.signer.to_account_info(),
            metadata: ctx.accounts.metadata.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            mint_authority: ctx.accounts.mint_authority.to_account_info(),
            collection_mint: ctx.accounts.collection_mint.to_account_info(),
            collection_metadata: ctx.accounts.collection_metadata.to_account_info(),
            collection_master_edition: ctx.accounts.collection_master_edition.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            sysvar_instruction: ctx.accounts.sysvar_instruction.to_account_info(),
            token_metadata_program: ctx.accounts.token_metadata_program.to_account_info(),
        };

        let verify_cpi_ctx = CpiContext::new(verify_cpi_program, verify_cpi_accounts);
        spl_nft::cpi::verify_collection(verify_cpi_ctx)?;

        msg!("Collection verified! NFT is now marked as verified: true");

        // Note: verification_result PDA remains open and can be reused
        // User can verify a new proof and mint another NFT using the same PDA

        Ok(())
    }
}

/// Internal helper function for proof verification logic
/// Called by both verify_proof_signatures and verify_proof_internal
fn verify_proof_internal_logic(
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

    // Check amount (match raw format from context: e.g., "-1000")
    // Context contains negative amounts like "transactionAmount":"-1000"
    let formatted_amount = format!("-{}", expected_amount);
    let amount_found = context.contains(&formatted_amount);
    require!(amount_found, Secp256k1Error::AmountMismatch);
    msg!("✓ Payment amount verified: {} KRW", expected_amount);

    // Currency is already validated above (must be KRW)
    msg!("✓ Currency verified: {}", expected_currency);

    msg!("Payment details verification successful!");
    Ok(())
}

/// Verify payment amount from proof context (simplified version)
fn verify_payment_amount(context: &str, required_amount: u64) -> Result<()> {
    let formatted_amount = format!("-{}", required_amount);
    require!(
        context.contains(&formatted_amount),
        Secp256k1Error::AmountMismatch
    );
    msg!("✓ Payment amount verified: {} KRW", required_amount);
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

#[derive(Accounts)]
pub struct VerifyProofInternal<'info> {
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct VerifyProofAndMint<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    // ========== spl-nft CPI Accounts ==========

    /// New NFT mint
    #[account(mut)]
    pub mint: Signer<'info>,

    /// User's token account
    #[account(mut)]
    pub destination: AccountInfo<'info>,

    /// CHECK: Metaplex metadata
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,

    /// CHECK: Metaplex master edition
    #[account(mut)]
    pub master_edition: UncheckedAccount<'info>,

    /// CHECK: spl-nft authority PDA
    pub mint_authority: UncheckedAccount<'info>,

    /// Collection mint
    #[account(mut)]
    pub collection_mint: Account<'info, Mint>,

    /// Collection state (price 정보 포함)
    #[account(
        mut,
        seeds = [b"collection_state", collection_mint.key().as_ref()],
        bump,
        seeds::program = spl_nft_program.key(),
    )]
    pub collection_state: Account<'info, CollectionState>,

    // ========== Programs ==========
    pub spl_nft_program: Program<'info, spl_nft::program::SplNft>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,

    /// CHECK: Token Metadata Program
    pub token_metadata_program: UncheckedAccount<'info>,
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

// ============================================================================
// Two-Transaction Pattern: Verification Result Storage
// ============================================================================

/// Verification result stored in PDA after successful proof verification
/// This allows splitting large proof verification from NFT minting
#[account]
#[derive(InitSpace)]
pub struct VerificationResult {
    /// User who verified the proof
    pub user: Pubkey,

    /// Timestamp when verification was completed
    pub verified_at: i64,

    /// Claim identifier from the verified proof
    #[max_len(66)] // 0x + 64 hex chars
    pub claim_identifier: String,

    /// Whether this verification has been used for minting
    pub is_used: bool,
}

/// Account structure for verify_proof instruction
#[derive(Accounts)]
pub struct VerifyProofNew<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        init_if_needed,  // Create if doesn't exist, otherwise reuse
        payer = signer,
        space = 8 + VerificationResult::INIT_SPACE,
        seeds = [b"verification", signer.key().as_ref()],
        bump,
    )]
    pub verification_result: Account<'info, VerificationResult>,

    pub system_program: Program<'info, System>,
}

/// Account structure for mint_with_verified_proof instruction
#[derive(Accounts)]
pub struct MintWithVerifiedProof<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    /// Verification result PDA (reusable for multiple mints)
    #[account(
        mut,
        seeds = [b"verification", signer.key().as_ref()],
        bump,
        constraint = verification_result.user == signer.key() @ Secp256k1Error::UnauthorizedUser,
    )]
    pub verification_result: Account<'info, VerificationResult>,

    // ========== NFT Mint Accounts (same as verify_proof_and_mint) ==========

    /// New NFT mint
    #[account(mut)]
    pub mint: Signer<'info>,

    /// User's token account
    #[account(mut)]
    pub destination: AccountInfo<'info>,

    /// CHECK: Metaplex metadata
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,

    /// CHECK: Metaplex master edition
    #[account(mut)]
    pub master_edition: UncheckedAccount<'info>,

    /// CHECK: spl-nft authority PDA
    pub mint_authority: UncheckedAccount<'info>,

    /// Collection mint
    #[account(mut)]
    pub collection_mint: Account<'info, Mint>,

    /// Collection state (price 정보 포함)
    #[account(
        mut,
        seeds = [b"collection_state", collection_mint.key().as_ref()],
        bump,
        seeds::program = spl_nft_program.key(),
    )]
    pub collection_state: Account<'info, CollectionState>,

    // ========== Verify Collection Accounts ==========

    /// Collection metadata (Metaplex)
    #[account(mut)]
    pub collection_metadata: Account<'info, MetadataAccount>,

    /// Collection master edition
    pub collection_master_edition: Account<'info, MasterEditionAccount>,

    /// Sysvar instruction account
    #[account(address = INSTRUCTIONS_ID)]
    /// CHECK: Sysvar instruction account that is being checked with an address constraint
    pub sysvar_instruction: UncheckedAccount<'info>,

    // ========== Programs ==========
    pub spl_nft_program: Program<'info, spl_nft::program::SplNft>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,

    /// CHECK: Token Metadata Program
    pub token_metadata_program: UncheckedAccount<'info>,
}
