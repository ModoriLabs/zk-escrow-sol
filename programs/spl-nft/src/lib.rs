use anchor_lang::prelude::*;

declare_id!("99hrQQHRwNoEFaaDyE8NoVmXykFTuPuhEgUYfq8J6dr1");

pub mod contexts;

pub use contexts::*;

#[program]
pub mod spl_nft {

    use super::*;
    pub fn create_collection(
        ctx: Context<CreateCollection>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        ctx.accounts.create_collection(&ctx.bumps, name, symbol, uri)
    }

    pub fn mint_nft(ctx: Context<MintNFT>) -> Result<()> {
        ctx.accounts.mint_nft(&ctx.bumps)
    }

    pub fn verify_collection(ctx: Context<VerifyCollectionMint>) -> Result<()> {
        ctx.accounts.verify_collection(&ctx.bumps)
    }
}
