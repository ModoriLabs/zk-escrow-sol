use anchor_lang::prelude::*;

declare_id!("Nu11ifier1111111111111111111111111111111111");

#[program]
pub mod nullifier_registry {
    use super::*;

    /// Initialize the nullifier registry
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        registry.authority = ctx.accounts.authority.key();
        registry.nullifier_count = 0;

        msg!("Nullifier registry initialized");
        msg!("Authority: {}", registry.authority);
        Ok(())
    }

    /// Mark a nullifier as used
    /// This prevents replay attacks by ensuring each proof can only be used once
    pub fn mark_nullifier(ctx: Context<MarkNullifier>, nullifier_hash: String) -> Result<()> {
        require!(
            !nullifier_hash.is_empty(),
            NullifierError::InvalidNullifier
        );

        let nullifier_record = &mut ctx.accounts.nullifier_record;
        nullifier_record.nullifier_hash = nullifier_hash.clone();
        nullifier_record.used_at = Clock::get()?.unix_timestamp;
        nullifier_record.used_by = ctx.accounts.user.key();

        let registry = &mut ctx.accounts.registry;
        registry.nullifier_count += 1;

        msg!("Nullifier marked as used: {}", nullifier_hash);
        msg!("Used by: {}", ctx.accounts.user.key());
        msg!("Total nullifiers: {}", registry.nullifier_count);

        Ok(())
    }

    /// Check if a nullifier has been used (read-only)
    /// This is called via CPI from other programs
    pub fn check_nullifier(ctx: Context<CheckNullifier>, nullifier_hash: String) -> Result<()> {
        // If the nullifier_record account exists and is initialized, the nullifier has been used
        let nullifier_record = &ctx.accounts.nullifier_record;

        require!(
            nullifier_record.nullifier_hash == nullifier_hash,
            NullifierError::NullifierHashMismatch
        );

        // If we reach here, the nullifier exists (has been used)
        return err!(NullifierError::NullifierAlreadyUsed);
    }
}

// ============================================================================
// Account Structures
// ============================================================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + NullifierRegistry::INIT_SPACE,
        seeds = [b"nullifier_registry"],
        bump,
    )]
    pub registry: Account<'info, NullifierRegistry>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nullifier_hash: String)]
pub struct MarkNullifier<'info> {
    #[account(
        mut,
        seeds = [b"nullifier_registry"],
        bump,
    )]
    pub registry: Account<'info, NullifierRegistry>,

    #[account(
        init,
        payer = user,
        space = 8 + NullifierRecord::INIT_SPACE,
        seeds = [b"nullifier", nullifier_hash.as_bytes()],
        bump,
    )]
    pub nullifier_record: Account<'info, NullifierRecord>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nullifier_hash: String)]
pub struct CheckNullifier<'info> {
    #[account(
        seeds = [b"nullifier", nullifier_hash.as_bytes()],
        bump,
    )]
    pub nullifier_record: Account<'info, NullifierRecord>,
}

// ============================================================================
// Data Structures
// ============================================================================

/// Global nullifier registry
#[account]
#[derive(InitSpace)]
pub struct NullifierRegistry {
    pub authority: Pubkey,
    pub nullifier_count: u64,
}

/// Individual nullifier record
#[account]
#[derive(InitSpace)]
pub struct NullifierRecord {
    #[max_len(32)] // Max 32 bytes for PDA seed compatibility
    pub nullifier_hash: String,
    pub used_at: i64,
    pub used_by: Pubkey,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum NullifierError {
    #[msg("Nullifier hash cannot be empty")]
    InvalidNullifier,

    #[msg("Nullifier has already been used")]
    NullifierAlreadyUsed,

    #[msg("Nullifier hash mismatch")]
    NullifierHashMismatch,
}
