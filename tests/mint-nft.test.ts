import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { SplNft } from "../target/types/spl_nft";

describe.only("Mint NFT", () => {
  // Configure the client
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.splNft as Program<SplNft>;
  const payer = provider.wallet as anchor.Wallet;
  const connection = provider.connection;

  // Metaplex Token Metadata Program ID
  const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
  );

  let mintKeypair: Keypair;
  let metadataPda: PublicKey;
  let editionPda: PublicKey;
  let associatedTokenAccount: PublicKey;

  // NFT metadata
  const nftName = "My Test NFT";
  const nftSymbol = "TESTNFT";
  const nftUri = "https://arweave.net/test-metadata-uri";

  before(async () => {
    console.log("\n" + "=".repeat(60));
    console.log("NFT Minting Test Setup");
    console.log("=".repeat(60));
    console.log("Program ID:", program.programId.toBase58());
    console.log("Payer:", payer.publicKey.toBase58());
    console.log("Cluster:", connection.rpcEndpoint);

    // Check balance
    const balance = await connection.getBalance(payer.publicKey);
    console.log("Payer balance:", balance / anchor.web3.LAMPORTS_PER_SOL, "SOL");
    console.log("");
  });

  it("mints an NFT with metadata and master edition", async () => {
    console.log("\n=== Minting NFT ===");

    // Generate a new keypair for the mint account
    mintKeypair = Keypair.generate();
    console.log("Mint pubkey:", mintKeypair.publicKey.toBase58());

    // Derive metadata PDA
    [metadataPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mintKeypair.publicKey.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID
    );
    console.log("Metadata PDA:", metadataPda.toBase58());

    // Derive master edition PDA
    [editionPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mintKeypair.publicKey.toBuffer(),
        Buffer.from("edition"),
      ],
      TOKEN_METADATA_PROGRAM_ID
    );
    console.log("Master Edition PDA:", editionPda.toBase58());

    // Get associated token account address
    associatedTokenAccount = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      payer.publicKey
    );
    console.log("Associated Token Account:", associatedTokenAccount.toBase58());

    console.log("\nNFT Metadata:");
    console.log("  Name:", nftName);
    console.log("  Symbol:", nftSymbol);
    console.log("  URI:", nftUri);

    // Call the mint_nft instruction
    console.log("\nCalling mint_nft instruction...");
    const tx = await program.methods
      .mintNft(nftName, nftSymbol, nftUri)
      .accounts({
        payer: payer.publicKey,
        metadataAccount: metadataPda,
        editionAccount: editionPda,
        mintAccount: mintKeypair.publicKey,
        associatedTokenAccount: associatedTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKeypair])
      .rpc();

    console.log("✅ NFT minted successfully!");
    console.log("Transaction signature:", tx);

    // Verify the mint account
    const mintInfo = await connection.getParsedAccountInfo(mintKeypair.publicKey);
    expect(mintInfo.value).to.not.be.null;

    const mintData = (mintInfo.value?.data as any).parsed.info;
    console.log("\n=== Mint Account Info ===");
    console.log("Decimals:", mintData.decimals);
    console.log("Supply:", mintData.supply);
    console.log("Mint Authority:", mintData.mintAuthority);
    console.log("Freeze Authority:", mintData.freezeAuthority);

    // Verify NFT properties
    expect(mintData.decimals).to.equal(0, "NFT should have 0 decimals");
    expect(mintData.supply).to.equal("1", "NFT supply should be 1");

    // Verify the token account
    const tokenAccountInfo = await connection.getParsedAccountInfo(
      associatedTokenAccount
    );
    expect(tokenAccountInfo.value).to.not.be.null;

    const tokenData = (tokenAccountInfo.value?.data as any).parsed.info;
    console.log("\n=== Token Account Info ===");
    console.log("Owner:", tokenData.owner);
    console.log("Mint:", tokenData.mint);
    console.log("Token Amount:", tokenData.tokenAmount.uiAmount);

    expect(tokenData.owner).to.equal(payer.publicKey.toBase58());
    expect(tokenData.mint).to.equal(mintKeypair.publicKey.toBase58());
    expect(tokenData.tokenAmount.uiAmount).to.equal(1);

    // Verify metadata account exists
    const metadataAccountInfo = await connection.getAccountInfo(metadataPda);
    expect(metadataAccountInfo).to.not.be.null;
    console.log("\n=== Metadata Account ===");
    console.log("Metadata PDA exists: ✅");
    console.log("Data length:", metadataAccountInfo?.data.length, "bytes");

    // Verify master edition account exists
    const editionAccountInfo = await connection.getAccountInfo(editionPda);
    expect(editionAccountInfo).to.not.be.null;
    console.log("\n=== Master Edition Account ===");
    console.log("Master Edition PDA exists: ✅");
    console.log("Data length:", editionAccountInfo?.data.length, "bytes");
  });

  it("displays NFT summary", () => {
    console.log("\n" + "=".repeat(60));
    console.log("NFT Summary");
    console.log("=".repeat(60));
    console.log("Name:", nftName);
    console.log("Symbol:", nftSymbol);
    console.log("URI:", nftUri);
    console.log("\nAddresses:");
    console.log("  Mint:", mintKeypair.publicKey.toBase58());
    console.log("  Metadata:", metadataPda.toBase58());
    console.log("  Master Edition:", editionPda.toBase58());
    console.log("  Token Account:", associatedTokenAccount.toBase58());
    console.log("  Owner:", payer.publicKey.toBase58());
    console.log("\nExplorer Links (localnet):");
    console.log(
      `  Mint: https://explorer.solana.com/address/${mintKeypair.publicKey.toBase58()}?cluster=custom`
    );
    console.log(
      `  Token Account: https://explorer.solana.com/address/${associatedTokenAccount.toBase58()}?cluster=custom`
    );
    console.log("=".repeat(60));
  });
});
