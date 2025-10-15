use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak::hash as keccak_256;

use crate::errors::Secp256k1Error;

/// Compute the claim identifier by hashing provider and context
/// with newline separator (parameters removed for size optimization)
pub fn hash_claim_info(provider: &str, context: &str) -> [u8; 32] {
    let mut serialized = String::with_capacity(
        provider.len() + context.len() + 1, // 1 newline character
    );
    serialized.push_str(provider);
    serialized.push('\n');
    serialized.push_str(context);

    keccak_256(serialized.as_bytes()).to_bytes()
}

/// Serialise claim data (identifier, owner, timestamp, epoch) exactly like
/// Solidity Claims.serialise which is used to create the signed payload.
pub fn serialise_claim_data(identifier: &str, owner: &str, timestamp_s: u32, epoch: u32) -> String {
    // The Solidity helper normalises to lowercase hex with 0x prefix.
    let identifier_normalised = identifier.to_lowercase();
    let owner_normalised = owner.to_lowercase();

    format!(
        "{}\n{}\n{}\n{}",
        identifier_normalised, owner_normalised, timestamp_s, epoch
    )
}

/// Utility to convert a 0x-prefixed hex string into bytes.
pub fn hex_str_to_bytes(hex_str: &str) -> Result<Vec<u8>> {
    let stripped = hex_str.strip_prefix("0x").unwrap_or(hex_str);
    hex::decode(stripped).map_err(|_| error!(Secp256k1Error::InvalidHex))
}

#[cfg(test)]
mod tests {
    use super::*;

    const PROVIDER: &str = "http";
    const CONTEXT: &str = "{\"extractedParameters\":{\"documentTitle\":\"송금확인증\",\"receivingBankAccount\":\"59733704003503(KB국민은행)\",\"recipientName\":\"이영분(부동산임대)\",\"senderNickname\":\"609호이현민\",\"transactionAmount\":\"-8,750\",\"transactionDate\":\"2025-06-17 22:08:30\"},\"providerHash\":\"0xffb501528259e6d684e1c2153fbbacab453fe9c97c336dc4f8f48d70a0e2a13d\"}";
    const EXPECTED_IDENTIFIER: &str =
        "7e3b052355e0d9d4ff99b94c9bb01164a68f4fdb7a52f09c371ee024e31203c3";

    #[test]
    fn hash_claim_info_matches_fixture() {
        let hash = hash_claim_info(PROVIDER, CONTEXT);
        assert_eq!(hex::encode(hash), EXPECTED_IDENTIFIER);
    }

    #[test]
    fn hash_claim_info_changes_with_input() {
        let original = hash_claim_info(PROVIDER, CONTEXT);
        let modified_context = "{\"extractedParameters\":{},\"providerHash\":\"0x00\"}";
        let modified = hash_claim_info(PROVIDER, modified_context);
        assert_ne!(original, modified);
    }
}
