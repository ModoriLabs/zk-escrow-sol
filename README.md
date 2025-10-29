### Run test

`anchor test`

### Deploy

#### setup local deployer

```sh
solana-keygen recover --outfile ./deployer.json --force
-> <seed phrase>
```

### build

```
anchor keys sync
solana-keygen pubkey target/deploy/zk_escrow_sol-keypair.json
anchor build
```

### deploy

```
solana airdrop 100 ./deployer.json
anchor deploy

# For devnet
# anchor build --features devnet
# anchor deploy --features devnet
```
### deploy collection
```
anchor run initialize
anchor run mint-collection
```

### localnet
```
anchor localnet # use this instead of 'solana-test-validator'
```

### Upload Image to Irys/Arweave

Upload an image from the assets folder to Irys (Arweave) for decentralized storage:

```sh
npm run upload-to-irys <counter>
```

Example:

```sh
npm run upload-to-irys 1  # uploads assets/1.png
npm run upload-to-irys 2  # uploads assets/2.png
```

This will return an Arweave URI that can be used for NFT metadata or token logos.

### scripts
```
anchor run mint-collection
anchor run mint-nft -- 3AW5mwSFBevBMF4ZyN7tv9atPPWBbtmrvxmyuf31Nv6C
anchor run show-metadata -- H2TTzWDkfRHCCP2fS5vCZnKJc9P4eaWmqeZVwUz4nB2C
```
