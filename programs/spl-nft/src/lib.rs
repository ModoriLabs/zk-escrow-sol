use anchor_lang::prelude::*;

declare_id!("9fH1v7Pa2nUAgd3xbszA1bpSeH8NRL8iQVWuWUuWot3p");

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
        price: u64,
    ) -> Result<()> {
        ctx.accounts.create_collection(&ctx.bumps, name, symbol, uri, price)
    }

    pub fn mint_nft(ctx: Context<MintNFT>) -> Result<()> {
        ctx.accounts.mint_nft(&ctx.bumps)
    }

    pub fn verify_collection(ctx: Context<VerifyCollectionMint>) -> Result<()> {
        ctx.accounts.verify_collection(&ctx.bumps)
    }
}
