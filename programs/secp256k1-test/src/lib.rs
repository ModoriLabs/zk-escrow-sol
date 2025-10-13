use anchor_lang::prelude::*;

declare_id!("A8oUCtSKbVxthxxLiWNWnRBjhZYpJen2zC2wHGWrSqYb");

#[program]
pub mod secp256k1_test {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }

    // Placeholder for verify_signature instruction
    // Will be implemented in Phase 5
    pub fn verify_signature(
        _ctx: Context<VerifySignature>,
        _message: String,
        _signature: Vec<u8>,
        _expected_address: String,
    ) -> Result<()> {
        // TODO: Implement in Phase 5
        msg!("verify_signature called - not yet implemented");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}

#[derive(Accounts)]
pub struct VerifySignature {}
