import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { CrossPile } from '../target/types/cross_pile';
import { Session, Initiator, Acceptor } from "../app/sessions";
import { expect } from 'chai';

describe('cross-pile', () => {
    const program = anchor.workspace.CrossPile as Program<CrossPile>;
    const ENV = 'http://localhost:8899';

    let initiatorSession: Session;
    let initiator: Initiator;
    let acceptorSession: Session;
    let acceptor: Acceptor;

    console.log("-----------------------------------");
    console.log("Set Up Complete");
    console.log("-----------------------------------");

    describe('new_challenge', () => {
        before(async () => {
            initiatorSession = new Session(program, ENV);
            initiator = new Initiator(initiatorSession);
            await initiatorSession.requestAirdrop();
        });

        it('creates a new challenge', async () => {
            const wagerTokenAmountBigNumber = new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL);
            const wagerTokenAmount = wagerTokenAmountBigNumber.toNumber();
            await initiator.setUp();
            await initiator.newChallenge(wagerTokenAmountBigNumber);
    
            let challengeData = await program.account.challenge.fetch(initiator.challengeAddress);
    
            expect(challengeData.initiator.toString(), "New challenge is owned by instantiating user.")
                .equals(initiatorSession.userKeypair.publicKey.toString());
            expect(challengeData.initiatorTokensMint.toString(), "New challenge wager amount tokens matches expected.")
                .equals(initiator.tokensMintPublickey.toString());
            expect(challengeData.acceptor.toString(), "acceptor set to default public key.")
                .equals(anchor.web3.PublicKey.default.toString());
            expect(challengeData.initiatorWagerTokenAmount.toNumber(), "wagered amount matches what was passed in.")
                .equals(wagerTokenAmount);
            expect(challengeData.initiatorEscrowWallet.toString(), "Initiator escrow token wallet is set.")
                .equals(initiator.initiatorEscrowWalletAddress.toString());
            // test that init escrow wallet is set here
        });
    });

    describe('accept_challenge', () => {
        before(async () => {
            initiatorSession = new Session(program, ENV);
            initiator = new Initiator(initiatorSession);
            acceptorSession = new Session(program, ENV);
            acceptor = new Acceptor(acceptorSession);
            await initiatorSession.requestAirdrop();
            await acceptorSession.requestAirdrop();
        });
        
        it('accepts a challenge', async () => {
            const initiatorWagerTokenAmountBigNumber = new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL);
            const initiatorWagerTokenAmount = initiatorWagerTokenAmountBigNumber.toNumber();
    
            await initiator.setUp();
            let challengeAddress = initiator.challengeAddress;
            await initiator.newChallenge(initiatorWagerTokenAmountBigNumber);
    
            // challenge created, now accept the challenge
            await acceptor.acceptChallenge(challengeAddress);

            let challengeData = await program.account.challenge.fetch(challengeAddress);

            console.log(challengeData);
            console.log(challengeAddress.toString());
    
            expect(challengeData.initiator.toString(), "initiator owner remains instantiator.")
                .equals(initiator.session.userKeypair.publicKey.toString());
            expect(challengeData.acceptor.toString(), "acceptor now set to accepting user's public key.")
                .equals(acceptor.session.userKeypair.publicKey.toString());
            expect(challengeData.initiatorWagerTokenAmount.toNumber()).equals(initiatorWagerTokenAmount);
        });
    });

    // describe('reveal_winner', () => {
    //     before(async () => {
    //         initiatorSession = new Session(program, ENV);
    //         initiator = new Initiator(initiatorSession);
    //         acceptorSession = new Session(program, ENV);
    //         acceptor = new Acceptor(acceptorSession);
    //         await initiatorSession.requestAirdrop();
    //         await acceptorSession.requestAirdrop();
    //     });
        
    //     it('disburses funds to winner', async () => {
    //         const wagerTokenAmountBigNumber = new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL);
    //         const wagerTokenAmount = wagerTokenAmountBigNumber.toNumber();
    
    //         await initiator.setChallengeAddress();
    //         let challengeAddress = initiator.challengeAddress;
    //         await initiator.newChallenge(wagerTokenAmountBigNumber);
    
    //         // challenge created, now accept the challenge
    //         await acceptor.acceptChallenge(challengeAddress);

    //         let challengeData = await program.account.challenge.fetch(challengeAddress);

    //         console.log(challengeData);
    //         console.log(challengeAddress.toString());
    
    //         expect(challengeData.initiator.toString(), "initiator owner remains instantiator.")
    //             .equals(initiator.session.userKeypair.publicKey.toString());
    //         expect(challengeData.acceptor.toString(), "acceptor now set to accepting user's public key.")
    //             .equals(acceptor.session.userKeypair.publicKey.toString());
    //         expect(challengeData.wagerTokenAmount.toNumber()).equals(wagerTokenAmount);
    //     });
    // });
});
