### Run test
`anchor test --arch sbf


### Deploy
#### setup local deployer
``` sh
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
```