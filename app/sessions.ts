import { web3, Wallet, Provider, Program, setProvider, Idl, } from '@project-serum/anchor';
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
        this.provider = new Provider(this.solConnection, this.walletWrapper, {
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

    async setUp() {
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
            9 // decimal places 9 TODO
            );
        
        console.log(`Initiator mint created (${this.tokensMintPublickey.toString()})`);

        this.initiatorTokensSource = await spl.getOrCreateAssociatedTokenAccount(
            this.session.provider.connection,
            this.session.userKeypair,
            this.tokensMintPublickey,
            this.session.userKeypair.publicKey,
        );

        await spl.mintTo(
            this.session.provider.connection,
            this.session.userKeypair,
            this.tokensMintPublickey,
            this.initiatorTokensSource.address,
            this.mintAuthority,
            2000
          );

        console.log(`Initiator tokens source (${this.initiatorTokensSource.address.toString()} created, and sent 2000 tokens)`);
    }

    /**
     * @param {any} amount
     */
    async newChallenge(amount) {
        setProvider(this.session.provider);

        await this.session.program.rpc.newChallenge(
            this.challengeBump,
            this.initiatorTokensVaultBump,
            amount, 
            {
                accounts: {
                    challenge: this.challengeAddress,
                    initiatorTokensVault: this.initiatorTokensVaultAddress,
                    initiatorTokensMint: this.tokensMintPublickey,
                    initiator: this.session.userKeypair.publicKey,
                    initiatorTokensSource: this.initiatorTokensSource.address,
                    systemProgram: web3.SystemProgram.programId,
                    rent: web3.SYSVAR_RENT_PUBKEY,
                    tokenProgram: spl.TOKEN_PROGRAM_ID,
                }
            }
        );
    }
 }

export class Acceptor {
    session: Session;

    constructor(session: Session) {
        this.session = session;
    }

    /**
     * @param {any} challenge
     */
    async acceptChallenge(challengeAddress) {
        setProvider(this.session.provider);

        await this.session.program.rpc.acceptChallenge(
            {
                accounts: {
                    challenge: challengeAddress,
                    acceptor: this.session.userKeypair.publicKey,
                    systemProgram: web3.SystemProgram.programId,
                }
            }
        );
    }
}