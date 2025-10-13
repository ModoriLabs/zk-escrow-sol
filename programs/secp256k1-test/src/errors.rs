use anchor_lang::prelude::*;

#[error_code]
pub enum Secp256k1Error {
    #[msg("Invalid signature format")]
    InvalidSignature,

    #[msg("Invalid recovery ID (must be 0 or 1)")]
    InvalidRecoveryId,

    #[msg("Failed to recover signer address")]
    RecoveryFailed,

    #[msg("Recovered address does not match expected address")]
    AddressMismatch,
}
