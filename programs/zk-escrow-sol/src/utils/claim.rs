use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak::hash as keccak_256;

use crate::errors::Secp256k1Error;

/// Compute the claim identifier by hashing provider, parameters and context
/// with newline separators, matching Solidity Claims.hashClaimInfo
pub fn hash_claim_info(provider: &str, parameters: &str, context: &str) -> [u8; 32] {
    let mut serialized = String::with_capacity(
        provider.len() + parameters.len() + context.len() + 2, // 2 newline characters
    );
    serialized.push_str(provider);
    serialized.push('\n');
    serialized.push_str(parameters);
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
    const PARAMETERS: &str = "{\"method\":\"GET\",\"responseMatches\":[{\"type\":\"regex\",\"value\":\"<table[^>]*class=\\\"table table--vertical-align-top mt-16\\\"[^>]*>.*?<tbody[^>]*class=\\\"table__tbody-row\\\"[^>]*>.*?<tr>.*?(?:<td[^>]*>[^<]*</td>\\\\s*){0}<td[^>]*>(?<transactionDate>[^<]+)</td>\"},{\"type\":\"regex\",\"value\":\"<table[^>]*class=\\\"table table--vertical-align-top mt-16\\\"[^>]*>.*?<tbody[^>]*class=\\\"table__tbody-row\\\"[^>]*>.*?<tr>.*?(?:<td[^>]*>[^<]*</td>\\\\s*){1}<td[^>]*>(?<recipientName>[^<]+)</td>\"},{\"type\":\"regex\",\"value\":\"<table[^>]*class=\\\"table table--vertical-align-top mt-16\\\"[^>]*>.*?<tbody[^>]*class=\\\"table__tbody-row\\\"[^>]*>.*?<tr>.*?(?:<td[^>]*>[^<]*</td>\\\\s*){3}<td[^>]*>(?<transactionAmount>[^<]+)</td>\"},{\"type\":\"regex\",\"value\":\"<table[^>]*class=\\\"table table--vertical-align-top mt-16\\\"[^>]*>.*?<tbody[^>]*class=\\\"table__tbody-row\\\"[^>]*>.*?<tr>.*?(?:<td[^>]*>[^<]*</td>\\\\s*){5}<td[^>]*>(?<receivingBankAccount>[^<]+)</td>\"},{\"type\":\"regex\",\"value\":\"<table[^>]*class=\\\"table table--vertical-align-top mt-16\\\"[^>]*>.*?<tbody[^>]*class=\\\"table__tbody-row\\\"[^>]*>.*?<tr>.*?(?:<td[^>]*>[^<]*</td>\\\\s*){6}<td[^>]*>(?<senderNickname>[^<]+)</td>\"},{\"type\":\"regex\",\"value\":\"<h1[^>]*>(?<documentTitle>[^<]+)</h1>\"}],\"url\":\"https://api.tossbank.com/api-public/document/view/{{URL_PARAMS_1}}/{{URL_PARAMS_GRD}}\"}";
    const CONTEXT: &str = "{\"extractedParameters\":{\"documentTitle\":\"송금확인증\",\"receivingBankAccount\":\"59733704003503(KB국민은행)\",\"recipientName\":\"이영분(부동산임대)\",\"senderNickname\":\"609호이현민\",\"transactionAmount\":\"-8,750\",\"transactionDate\":\"2025-06-17 22:08:30\"},\"providerHash\":\"0xffb501528259e6d684e1c2153fbbacab453fe9c97c336dc4f8f48d70a0e2a13d\"}";
    const EXPECTED_IDENTIFIER: &str =
        "a961e112e7bf3aba020fb875b43dc45f3a9ab214167c3c28cce424a7e46a3378";

    #[test]
    fn hash_claim_info_matches_fixture() {
        let hash = hash_claim_info(PROVIDER, PARAMETERS, CONTEXT);
        assert_eq!(hex::encode(hash), EXPECTED_IDENTIFIER);
    }

    #[test]
    fn hash_claim_info_changes_with_input() {
        let original = hash_claim_info(PROVIDER, PARAMETERS, CONTEXT);
        let modified_context = "{\"extractedParameters\":{},\"providerHash\":\"0x00\"}";
        let modified = hash_claim_info(PROVIDER, PARAMETERS, modified_context);
        assert_ne!(original, modified);
    }
}
