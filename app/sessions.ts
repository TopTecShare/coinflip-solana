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
            commitment: 'finalized'
        });
        this.program = new Program(program.idl, program.programId, this.provider);
    }

    async getBalance() {
        setProvider(this.provider);
        return await this.provider.connection.getBalance(this.userKeypair.publicKey, "finalized");
    }

    async requestAirdrop(amount=10_000_000_000) {
        setProvider(this.provider);

        await this.provider.connection.confirmTransaction(
            await this.provider.connection.requestAirdrop(this.userKeypair.publicKey, amount),
            "finalized"
        );

        console.log(await this.provider.connection.getBalance(this.userKeypair.publicKey));
    }
}

export class Initiator {
    session: Session;
    challengeAddress: PublicKey;
    challengeBump: any; // u8
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

        this.mintAuthority = web3.Keypair.generate();

        console.log("mint time boy");

        this.tokensMintPublickey = await spl.createMint(
            this.session.provider.connection,
            this.session.userKeypair,
            this.mintAuthority.publicKey,
            null, // don't need a freeze authority for the example mint
            9 // decimal places 9 TODO
            );
    }

    /**
     * @param {any} amount
     */
    async newChallenge(amount) {
        setProvider(this.session.provider);

        await this.session.program.rpc.newChallenge(
            this.challengeBump, 
            amount, 
            {
                accounts: {
                    challenge: this.challengeAddress,
                    initiatorTokensMint: this.tokensMintPublickey,
                    initiator: this.session.userKeypair.publicKey,
                    systemProgram: web3.SystemProgram.programId,
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