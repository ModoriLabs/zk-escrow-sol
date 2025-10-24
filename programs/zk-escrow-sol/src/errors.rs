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

    #[msg("Claim identifier does not match expected value")]
    IdentifierMismatch,

    #[msg("Failed to decode hex string")]
    InvalidHex,

    #[msg("Invalid bank account")]
    InvalidBankAccount,

    #[msg("Amount must be greater than zero")]
    InvalidAmount,

    #[msg("Invalid currency - only KRW supported")]
    InvalidCurrency,

    #[msg("Recipient bank account mismatch")]
    RecipientMismatch,

    #[msg("Payment amount mismatch")]
    AmountMismatch,

    #[msg("Unauthorized: user does not own this verification result")]
    UnauthorizedUser,

    #[msg("Verification result has already been used")]
    AlreadyUsed,

    #[msg("Verification has expired (older than 5 minutes)")]
    VerificationExpired,
}
