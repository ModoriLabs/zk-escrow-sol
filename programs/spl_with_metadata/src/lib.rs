use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use mpl_token_metadata::instructions::{
    CreateMetadataAccountV3Cpi,
    CreateMetadataAccountV3CpiAccounts,
    CreateMetadataAccountV3InstructionArgs,
};
use mpl_token_metadata::types::{Creator, DataV2};
use mpl_token_metadata::ID as METADATA_PROGRAM_ID;

declare_id!("J72XdorZyciQyrVHJvZfyhVzYWHfWPGRbtRtbor3RPst");

#[program]
pub mod spl_with_metadata {
    use super::*;

    pub fn create_token_metadata(
        ctx: Context<CreateTokenMetadata>,
        name: String,
        symbol: String,
        uri: String,
        seller_fee_basis_points: u16,
        is_mutable: bool,
    ) -> Result<()> {
        let data = DataV2 {
            name,
            symbol,
            uri,
            seller_fee_basis_points,
            creators: Some(vec![Creator {
                address: ctx.accounts.payer.key(),
                verified: true,
                share: 100,
            }]),
            collection: None,
            uses: None,
        };

        let mint_key = ctx.accounts.mint.key();
        let seeds = &[
            b"metadata".as_ref(),
            METADATA_PROGRAM_ID.as_ref(),
            mint_key.as_ref(),
        ];
        let (metadata_pda, _) = Pubkey::find_program_address(seeds, &METADATA_PROGRAM_ID);

        // Ensure the provided metadata account matches the PDA
        require!(
            metadata_pda == ctx.accounts.metadata.key(),
            MetaplexError::InvalidMetadataAccount
        );

        // Create and execute the CPI to create metadata
        let token_metadata_program_info =
            ctx.accounts.token_metadata_program.to_account_info();
        let metadata_info = ctx.accounts.metadata.to_account_info();
        let mint_info = ctx.accounts.mint.to_account_info();
        let authority_info = ctx.accounts.authority.to_account_info();
        let payer_info = ctx.accounts.payer.to_account_info();
        let system_program_info = ctx.accounts.system_program.to_account_info();
        let rent_info = ctx.accounts.rent.to_account_info();

        let cpi = CreateMetadataAccountV3Cpi::new(
            &token_metadata_program_info,
            CreateMetadataAccountV3CpiAccounts {
                metadata: &metadata_info,
                mint: &mint_info,
                mint_authority: &authority_info,
                payer: &payer_info,
                update_authority: (&authority_info, true),
                system_program: &system_program_info,
                rent: Some(&rent_info),
            },
            CreateMetadataAccountV3InstructionArgs {
                data,
                is_mutable,
                collection_details: None,
            },
        );
        cpi.invoke()?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateTokenMetadata<'info> {
    /// CHECK: This account is created and validated by the Metaplex Token Metadata program via CPI
    #[account(mut)]
    pub metadata: AccountInfo<'info>,

    #[account(mut)]
    pub mint: Account<'info, Mint>,

    pub authority: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,

    /// CHECK: This is the Metaplex Token Metadata program ID, verified by address constraint
    #[account(address = METADATA_PROGRAM_ID)]
    pub token_metadata_program: AccountInfo<'info>,
}

#[error_code]
pub enum MetaplexError {
    #[msg("The provided metadata account does not match the PDA for this mint")]
    InvalidMetadataAccount,
}
