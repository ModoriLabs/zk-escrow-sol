use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use solana_program::keccak;

use nullifier_registry;
use zk_escrow_sol;

declare_id!("BxaG13bDcy3YwQUfbJHYQQR6rAwt47acUuoSSWSMc1yt");

#[program]
pub mod token_escrow {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        required_threshold: u8,
        admin: Pubkey,
        expected_witnesses: Vec<String>,
    ) -> Result<()> {
        require!(required_threshold > 0, EscrowError::InvalidThreshold);
        require!(!expected_witnesses.is_empty(), EscrowError::InvalidWitnesses);
        require!(
            (required_threshold as usize) <= expected_witnesses.len(),
            EscrowError::InvalidThreshold
        );

        let escrow = &mut ctx.accounts.escrow;
        escrow.verification_program = ctx.accounts.verification_program.key();
        escrow.required_threshold = required_threshold;
        escrow.admin = admin;
        escrow.expected_witnesses = expected_witnesses.clone();

        msg!("Escrow initialized");
        msg!("Admin: {}", admin);
        msg!("Verification program: {}", escrow.verification_program);
        msg!("Required threshold: {}", required_threshold);
        msg!("Expected witnesses: {:?}", expected_witnesses);
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, EscrowError::InvalidAmount);

        // Transfer tokens from depositor to escrow vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.depositor_token_account.to_account_info(),
            to: ctx.accounts.escrow_vault.to_account_info(),
            authority: ctx.accounts.depositor.to_account_info(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        token::transfer(cpi_ctx, amount)?;

        msg!("Deposited {:?} tokens to escrow", amount);
        Ok(())
    }

    pub fn withdraw(
        ctx: Context<Withdraw>,
        amount: u64,
        proof: Proof,
    ) -> Result<()> {
        require!(amount > 0, EscrowError::InvalidAmount);

        let escrow = &ctx.accounts.escrow;

        // Verify proof via CPI to verification program
        let required_threshold = escrow.required_threshold;
        let expected_witnesses = escrow.expected_witnesses.clone();

        let cpi_program = ctx.accounts.verification_program.to_account_info();
        let cpi_accounts = zk_escrow_sol::cpi::accounts::VerifyProofSignatures {
            signer: ctx.accounts.user.to_account_info(),
            payment_config: ctx.accounts.payment_config.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        let verification_result = zk_escrow_sol::cpi::verify_proof_signatures(
            cpi_ctx,
            proof.clone(),
            expected_witnesses,
            required_threshold,
        );

        require!(verification_result.is_ok(), EscrowError::ProofVerificationFailed);

        msg!("Proof verified successfully via CPI");

        // Calculate nullifier hash from proof context (deterministic)
        let nullifier_hash = calculate_nullifier(&proof.claim_info.context)?;
        msg!("Calculated nullifier hash: {}", nullifier_hash);

        // Mark nullifier as used to prevent replay attacks
        let nullifier_cpi_program = ctx.accounts.nullifier_program.to_account_info();
        let nullifier_cpi_accounts = nullifier_registry::cpi::accounts::MarkNullifier {
            registry: ctx.accounts.nullifier_registry.to_account_info(),
            nullifier_record: ctx.accounts.nullifier_record.to_account_info(),
            user: ctx.accounts.user.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };
        let nullifier_cpi_ctx = CpiContext::new(nullifier_cpi_program, nullifier_cpi_accounts);

        nullifier_registry::cpi::mark_nullifier(nullifier_cpi_ctx, nullifier_hash)?;

        msg!("Nullifier marked as used");

        // Transfer tokens from escrow vault to user
        let seeds = &[
            b"escrow".as_ref(),
            &[ctx.bumps.escrow],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_vault.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);

        token::transfer(cpi_ctx, amount)?;

        msg!("Withdrawn {:?} tokens to {}", amount, ctx.accounts.user.key());
        Ok(())
    }

    pub fn admin_withdraw(ctx: Context<AdminWithdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, EscrowError::InvalidAmount);

        let escrow = &ctx.accounts.escrow;

        // Verify admin
        require!(ctx.accounts.admin.key() == escrow.admin, EscrowError::UnauthorizedAdmin);

        // Transfer tokens from escrow vault to admin
        let seeds = &[
            b"escrow".as_ref(),
            &[ctx.bumps.escrow],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_vault.to_account_info(),
            to: ctx.accounts.admin_token_account.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);

        token::transfer(cpi_ctx, amount)?;

        msg!("Admin withdrawn {:?} tokens", amount);
        Ok(())
    }

}

// ============================================================================
// Account Structures
// ============================================================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [b"escrow"],
        bump,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: The verification program ID
    pub verification_program: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(mut)]
    pub depositor_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub escrow_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        seeds = [b"escrow"],
        bump,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub escrow_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,

    /// CHECK: Verification program loaded from escrow config
    #[account(constraint = verification_program.key() == escrow.verification_program)]
    pub verification_program: AccountInfo<'info>,

    /// CHECK: Payment config PDA from verification program
    pub payment_config: AccountInfo<'info>,

    /// CHECK: Nullifier program
    pub nullifier_program: AccountInfo<'info>,

    /// CHECK: Nullifier registry PDA (must be mutable)
    #[account(mut)]
    pub nullifier_registry: AccountInfo<'info>,

    /// CHECK: Nullifier record PDA (will be created by CPI, must be mutable)
    #[account(mut)]
    pub nullifier_record: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminWithdraw<'info> {
    #[account(
        seeds = [b"escrow"],
        bump,
    )]
    pub escrow: Account<'info, Escrow>,

    pub admin: Signer<'info>,

    #[account(mut)]
    pub admin_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub escrow_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Calculate deterministic nullifier hash from proof context
/// Format: keccak256(senderNickname + transactionDate)
fn calculate_nullifier(context: &str) -> Result<String> {
    // Parse JSON context
    let parsed: serde_json::Value = serde_json::from_str(context)
        .map_err(|_| EscrowError::InvalidContext)?;

    // Extract extractedParameters
    let params = parsed.get("extractedParameters")
        .ok_or(EscrowError::InvalidContext)?;

    // Extract senderNickname and transactionDate
    let sender_nickname = params.get("senderNickname")
        .and_then(|v| v.as_str())
        .ok_or(EscrowError::MissingSenderNickname)?;

    let transaction_date = params.get("transactionDate")
        .and_then(|v| v.as_str())
        .ok_or(EscrowError::MissingTransactionDate)?;

    // Create nullifier data
    let nullifier_data = format!("{}{}", sender_nickname, transaction_date);
    msg!("Nullifier data: {}", nullifier_data);

    // Hash using keccak256
    let hash = keccak::hash(nullifier_data.as_bytes());

    // Convert to hex string (first 16 bytes to stay within 32 byte limit)
    let hash_str = hex::encode(&hash.0[..16]);

    msg!("Nullifier hash (32 chars): {}", hash_str);

    Ok(hash_str)
}

// ============================================================================
// Data Structures
// ============================================================================

/// Type alias for proof from verification program
pub type Proof = zk_escrow_sol::Proof;

/// Escrow account configuration
#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub verification_program: Pubkey,
    pub required_threshold: u8,
    pub admin: Pubkey,
    #[max_len(10, 66)] // 10 items, 66 characters each
    pub expected_witnesses: Vec<String>,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum EscrowError {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,

    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("Nullifier hash cannot be empty")]
    InvalidNullifier,

    #[msg("Arithmetic underflow")]
    Underflow,

    #[msg("Required threshold must be greater than zero")]
    InvalidThreshold,

    #[msg("Unauthorized admin access")]
    UnauthorizedAdmin,

    #[msg("Expected witnesses list cannot be empty")]
    InvalidWitnesses,

    #[msg("Proof verification failed")]
    ProofVerificationFailed,

    #[msg("Invalid context format")]
    InvalidContext,

    #[msg("Missing senderNickname in context")]
    MissingSenderNickname,

    #[msg("Missing transactionDate in context")]
    MissingTransactionDate,
}
