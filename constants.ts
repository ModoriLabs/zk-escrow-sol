import * as anchor from '@coral-xyz/anchor'

export const RECIPIENT_BANK_ACCOUNT = '100202642943(토스뱅크)'
export const ALLOWED_AMOUNT = new anchor.BN(1000) // 1000 KRW (matches proof.json: "-1000")
export const FIAT_CURRENCY = 'KRW'

// Collection parameters
export const COLLECTION_NAME = 'KCONA KPOP STAR'
export const COLLECTION_SYMBOL = 'KSART'
export const COLLECTION_URI =
  'https://kcona.s3.ap-northeast-2.amazonaws.com/_collection'
export const COLLECTION_URI_PREFIX =
  'https://kcona.s3.ap-northeast-2.amazonaws.com/json'
export const NFT_PRICE = 1000 // KRW
