import { web3, Wallet, Provider, Program, setProvider, Idl, BN, AnchorProvider, } from '@project-serum/anchor';
import { Keypair, PublicKey, Connection } from '@solana/web3.js';
import { CrossPile } from '../target/types/cross_pile';
import * as spl from '@solana/spl-token';

export class Session {
    userKeypair: Keypair;
    idl: Idl;
    programId: PublicKey;
    seed: string;
    solConnection: Connection;
    walletWrapper: Wallet;
    provider: Provider;
    program: Program<CrossPile>;

    constructor(program: Program<CrossPile>, env: string) {
        this.userKeypair = web3.Keypair.generate();;
        this.idl = program.idl;
        this.programId = program.programId;
        this.seed = "challenge";

        this.solConnection = new web3.Connection(env);
        this.walletWrapper = new Wallet(this.userKeypair);
        this.provider = new AnchorProvider(this.solConnection, this.walletWrapper, {
            preflightCommitment: 'recent',
            commitment: 'confirmed'
        });
        this.program = new Program(program.idl, program.programId, this.provider);
    }

    async getBalance() {
        setProvider(this.provider);
        return await this.provider.connection.getBalance(this.userKeypair.publicKey, 'processed');
    }

    async requestAirdrop(amount=10_000_000_000) {
        setProvider(this.provider);

        await this.provider.connection.confirmTransaction(
            await this.provider.connection.requestAirdrop(this.userKeypair.publicKey, amount),
            'finalized'
        );
    }
}

export class Initiator {
    session: Session;
    challengeAddress: PublicKey;
    challengeBump: any; // u8
    initiatorTokensVaultSeed: string = "initiator_tokens_vault";
    initiatorTokensVaultAddress: PublicKey;
    initiatorTokensVaultBump: any; // u8
    initiatorTokensSource: spl.Account;
    mintAuthority: Keypair;
    tokensMintPublickey: PublicKey;

    constructor(session: Session) {
        this.session = session;
    }

    async setUp(initiatorTokenFundAmount: number) {
        setProvider(this.session.provider);

        [this.challengeAddress, this.challengeBump] = await web3.PublicKey.findProgramAddress(
            [Buffer.from(this.session.seed), this.session.userKeypair.publicKey.toBuffer()],
            this.session.programId,
        );

        console.log(`Challenge Address (${this.challengeAddress.toString()}) and Bump (${this.challengeBump}) created`);

        [this.initiatorTokensVaultAddress, this.initiatorTokensVaultBump] = await web3.PublicKey.findProgramAddress(
            [Buffer.from(this.initiatorTokensVaultSeed), this.session.userKeypair.publicKey.toBuffer()],
            this.session.programId,
        );

        console.log(`Initiator Tokens Vault Address (${this.initiatorTokensVaultAddress.toString()}) and Bump (${this.initiatorTokensVaultBump}) created`);

        this.mintAuthority = web3.Keypair.generate();

        this.tokensMintPublickey = await spl.createMint(
            this.session.provider.connection,
            this.session.userKeypair,
            this.mintAuthority.publicKey,
            null, // don't need a freeze authority for the example mint
            9, // decimal places 9 TODO
            web3.Keypair.generate(),
            {commitment: 'finalized'}
            );
        
        console.log(`Initiator mint created (${this.tokensMintPublickey.toString()})`);

        this.initiatorTokensSource = await spl.getOrCreateAssociatedTokenAccount(
            this.session.provider.connection,
            this.session.userKeypair,
            this.tokensMintPublickey,
            this.session.userKeypair.publicKey,
        );

        const mintTx = await spl.mintTo(
            this.session.provider.connection,
            this.session.userKeypair,
            this.tokensMintPublickey,
            this.initiatorTokensSource.address,
            this.mintAuthority,
            initiatorTokenFundAmount
        );
        
        // await this.session.provider.connection.confirmTransaction(
        //     mintTx,
        //     'finalized'
        // );

        let [_, amount] = await readTokenAccount(this.initiatorTokensSource.address, this.session.provider);
        console.log(`Initiator tokens source (${this.initiatorTokensSource.address.toString()} created, and has ${amount} tokens)`);
        console.table([
            {address: "challenge: " + this.challengeAddress, bump: "challenge: " + this.challengeBump},
            {address: "initiator tokens vault: " + this.initiatorTokensVaultAddress, bump: "initiator tokens vault: " + this.initiatorTokensVaultBump}
        ])
    }

    async newChallenge(amount: BN): Promise<string> {
        setProvider(this.session.provider);

        return await this.session.program.methods.newChallenge(
            this.challengeBump,
            this.initiatorTokensVaultBump,
            amount
            )
            .accounts({
                challenge: this.challengeAddress,
                initiatorTokensVault: this.initiatorTokensVaultAddress,
                initiatorTokensMint: this.tokensMintPublickey,
                initiator: this.session.userKeypair.publicKey,
                initiatorTokensSource: this.initiatorTokensSource.address,
                systemProgram: web3.SystemProgram.programId,
                rent: web3.SYSVAR_RENT_PUBKEY,
                tokenProgram: spl.TOKEN_PROGRAM_ID,
            })
            .rpc();
    }
 }

export class Acceptor {
    session: Session;
    acceptorTokensVaultAddress: PublicKey;
    acceptorTokensVaultBump: any; // u8
    initiatorTokensVaultSeed: string = "acceptor_tokens_vault";
    mintAuthority: Keypair;
    tokensMintPublickey: PublicKey;
    acceptorTokensSource: spl.Account;

    constructor(session: Session) {
        this.session = session;
    }

    async setUp(acceptorTokenFundAmount: number) {
        setProvider(this.session.provider);

        [this.acceptorTokensVaultAddress, this.acceptorTokensVaultBump] = await web3.PublicKey.findProgramAddress(
            [Buffer.from(this.initiatorTokensVaultSeed), this.session.userKeypair.publicKey.toBuffer()],
            this.session.programId,
        );

        console.log(`Acceptor Tokens Vault Address (${this.acceptorTokensVaultAddress.toString()}) and Bump`
          + `(${this.acceptorTokensVaultBump}) created`);

        this.mintAuthority = web3.Keypair.generate();

        this.tokensMintPublickey = await spl.createMint(
            this.session.provider.connection,
            this.session.userKeypair,
            this.mintAuthority.publicKey,
            null, // don't need a freeze authority for the example mint
            9, // decimal places 9 TODO
            web3.Keypair.generate(),
            {commitment: 'finalized'}
            );
        
        console.log(`Initiator mint created (${this.tokensMintPublickey.toString()})`);

        this.acceptorTokensSource = await spl.getOrCreateAssociatedTokenAccount(
            this.session.provider.connection,
            this.session.userKeypair,
            this.tokensMintPublickey,
            this.session.userKeypair.publicKey,
        );

        const mintTx = await spl.mintTo(
            this.session.provider.connection,
            this.session.userKeypair,
            this.tokensMintPublickey,
            this.acceptorTokensSource.address,
            this.mintAuthority,
            acceptorTokenFundAmount
        );

        let [_, amount] = await readTokenAccount(this.acceptorTokensSource.address, this.session.provider);
        console.log(`Acceptor tokens source (${this.acceptorTokensSource.address.toString()} created, and has ${amount} tokens)`);
    }

    /**
     * @param {any} challenge
     */
    async acceptChallenge(challengeAddress, wagerTokenAmount: BN): Promise<string> {
        setProvider(this.session.provider);

        return await this.session.program.methods.acceptChallenge(
            this.acceptorTokensVaultBump,
            wagerTokenAmount
        )
        .accounts({
            acceptor: this.session.userKeypair.publicKey,
            challenge: challengeAddress,
            acceptorTokensVault: this.acceptorTokensVaultAddress,
            acceptorTokensMint: this.tokensMintPublickey,
            acceptorTokensSource: this.acceptorTokensSource.address,
            systemProgram: web3.SystemProgram.programId,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            rent: web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();
    }
}

export const readTokenAccount = async (accountPublicKey: web3.PublicKey, provider: Provider): Promise<[spl.RawAccount, string]> => {
    const tokenInfoLol = await provider.connection.getAccountInfo(accountPublicKey);
    const data = Buffer.from(tokenInfoLol.data);
    const accountInfo: spl.RawAccount = spl.AccountLayout.decode(data);

    const amount = accountInfo.amount.toString();
    return [accountInfo, amount.toString()];
}