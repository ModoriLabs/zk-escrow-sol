use anchor_lang::prelude::*;

declare_id!("BvHdh8mMnXq9EnhrVD6Q1i1eR4SavuHnxZFXCCoCAuoZ");

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
    pub fn mark_nullifier(ctx: Context<MarkNullifier>, nullifier_hash: [u8; 32]) -> Result<()> {
        let nullifier_record = &mut ctx.accounts.nullifier_record;
        nullifier_record.nullifier_hash = nullifier_hash;
        nullifier_record.used_at = Clock::get()?.unix_timestamp;
        nullifier_record.used_by = ctx.accounts.user.key();

        let registry = &mut ctx.accounts.registry;
        registry.nullifier_count += 1;

        msg!("Nullifier marked as used: {:?}", nullifier_hash);
        msg!("Used by: {}", ctx.accounts.user.key());
        msg!("Total nullifiers: {}", registry.nullifier_count);

        Ok(())
    }

    /// Check if a nullifier has been used (read-only)
    /// This is called via CPI from other programs to prevent replay attacks
    /// Returns error if nullifier is already used
    pub fn check_nullifier(ctx: Context<CheckNullifier>, nullifier_hash: [u8; 32]) -> Result<()> {
        let nullifier_record_account = &ctx.accounts.nullifier_record;

        // Check if the account is initialized (has data)
        if !nullifier_record_account.data_is_empty() {
            // Account exists - it's been used
            msg!("Nullifier already used: {:?}", nullifier_hash);
            return err!(NullifierError::NullifierAlreadyUsed);
        }

        msg!("Nullifier check passed: {:?} (not used before)", nullifier_hash);
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
#[instruction(nullifier_hash: [u8; 32])]
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
        seeds = [b"nullifier", nullifier_hash.as_ref()],
        bump,
    )]
    pub nullifier_record: Account<'info, NullifierRecord>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nullifier_hash: [u8; 32])]
pub struct CheckNullifier<'info> {
    /// CHECK: This account may or may not exist. We manually check if it's initialized.
    #[account(
        seeds = [b"nullifier", nullifier_hash.as_ref()],
        bump,
    )]
    pub nullifier_record: AccountInfo<'info>,
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
    pub nullifier_hash: [u8; 32], // Raw keccak256 hash bytes
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
