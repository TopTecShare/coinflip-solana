import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { CrossPile } from '../target/types/cross_pile';
import { Session, Initiator, Acceptor, readTokenAccount } from "../app/sessions";
import * as spl from '@solana/spl-token';
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

    xdescribe('new_challenge', () => {
        before(async () => {
            initiatorSession = new Session(program, ENV);
            initiator = new Initiator(initiatorSession);
            await initiatorSession.requestAirdrop();
        });

        it('creates a new challenge', async () => {
            const initialTokenFundAmount = 2000;
            const wagerTokensAmount = 1000;
            const wagerTokensAmountBigNumber = new anchor.BN(wagerTokensAmount);

            await initiator.setUp(initialTokenFundAmount);

            let newChallengeTx = await initiator.newChallenge(wagerTokensAmountBigNumber);
            await initiatorSession.provider.connection.confirmTransaction(
                newChallengeTx, 'finalized'
            );
    
            let challengeData = await program.account.challenge.fetch(initiator.challengeAddress);
            let [, tokenSourceAmount] = await readTokenAccount(initiator.initiatorTokensSource.address, initiatorSession.provider);
            console.log(`tokenSource: ${initiator.initiatorTokensSource.address} now has ${tokenSourceAmount} tokens.`);

            const initiatorTokensVaultAccount = await spl.getAccount(
                initiatorSession.provider.connection,
                initiator.initiatorTokensVaultAddress
            );

            expect(challengeData.initiator.toString(), "New challenge is owned by instantiating user.")
                .equals(initiatorSession.userKeypair.publicKey.toString());
            expect(challengeData.initiatorTokensMint.toString(), "New challenge wager amount tokens matches expected.")
                .equals(initiator.tokensMintPublickey.toString());
            expect(challengeData.acceptor.toString(), "acceptor set to default public key.")
                .equals(anchor.web3.PublicKey.default.toString());
            expect(challengeData.initiatorWagerTokenAmount.toNumber(), "Wagered amount matches what was passed in.")
                .equals(wagerTokensAmount);
            expect(challengeData.initiatorTokensVault.toString(), "Initiator escrow token wallet is set.")
                .equals(initiator.initiatorTokensVaultAddress.toString());
            expect(tokenSourceAmount)
                .equals(`${initialTokenFundAmount - wagerTokensAmount}`);
            expect(Number(initiatorTokensVaultAccount.amount))
                .equals(Number(wagerTokensAmount));
        });
    });

    xdescribe('accept_challenge', () => {
        before(async () => {
            initiatorSession = new Session(program, ENV);
            initiator = new Initiator(initiatorSession);
            acceptorSession = new Session(program, ENV);
            acceptor = new Acceptor(acceptorSession);
            await initiatorSession.requestAirdrop();
            await acceptorSession.requestAirdrop();
        });
        
        it('accepts a challenge', async () => {
            const initialTokenFundAmount = 5000;
            const initiatorWagerTokenAmountBigNumber = new anchor.BN(1000);
            const initiatorWagerTokenAmount = initiatorWagerTokenAmountBigNumber.toNumber();
            const acceptorWagerTokenAmountBigNumber = new anchor.BN(37);
            const acceptorWagerTokenAmount = acceptorWagerTokenAmountBigNumber.toNumber();
    
            await initiator.setUp(initialTokenFundAmount);
            await acceptor.setUp(initialTokenFundAmount);
            let challengeAddress = initiator.challengeAddress;
            await initiator.newChallenge(initiatorWagerTokenAmountBigNumber);
            console.log("new challenge created");
    
            // challenge created, now accept the challenge
            let acceptTx = await acceptor.acceptChallenge(challengeAddress, acceptorWagerTokenAmountBigNumber);
            await acceptorSession.provider.connection.confirmTransaction(
                acceptTx,
                'finalized'
            );

            console.log('challenge accepted');

            let challengeData = await program.account.challenge.fetch(challengeAddress);
            console.log("challenge data fetched: " + challengeData);
            let [, tokenSourceAmount] = await readTokenAccount(acceptor.acceptorTokensSource.address, acceptorSession.provider);
            console.log("token source amount retrieved: " + tokenSourceAmount);

            const acceptorTokensVault = await spl.getAccount(
                acceptorSession.provider.connection,
                acceptor.acceptorTokensVaultAddress
            );

            console.log(challengeData);
            console.log(challengeAddress.toString());
    
            expect(challengeData.initiator.toString(), "initiator owner remains instantiator.")
                .equals(initiator.session.userKeypair.publicKey.toString());
            expect(challengeData.acceptor.toString(), "acceptor now set to accepting user's public key.")
                .equals(acceptor.session.userKeypair.publicKey.toString());
            expect(challengeData.initiatorWagerTokenAmount.toNumber()).equals(initiatorWagerTokenAmount);
            expect(challengeData.acceptorTokensVault.toString()).equals(acceptor.acceptorTokensVaultAddress.toString());
            expect(tokenSourceAmount, "Token source should be initial amount minus the amount bet in the wager.")
                .equals(`${initialTokenFundAmount - acceptorWagerTokenAmount}`);
            expect(Number(acceptorTokensVault.amount), "Acceptor tokens vault should have the wager amount deposited in it.")
                .equals(Number(acceptorWagerTokenAmount));
        });
    });

    describe('reveal_winner', () => {
        before(async () => {
            initiatorSession = new Session(program, ENV);
            initiator = new Initiator(initiatorSession);
            acceptorSession = new Session(program, ENV);
            acceptor = new Acceptor(acceptorSession);
            await initiatorSession.requestAirdrop();
            await acceptorSession.requestAirdrop();
        });
        
        it('reveals a winner', async () => {
            const initialTokenFundAmount = 5000;
            const initiatorWagerTokenAmountBigNumber = new anchor.BN(1000);
            const initiatorWagerTokenAmount = initiatorWagerTokenAmountBigNumber.toNumber();
            const acceptorWagerTokenAmountBigNumber = new anchor.BN(37);
            const acceptorWagerTokenAmount = acceptorWagerTokenAmountBigNumber.toNumber();
    
            await initiator.setUp(initialTokenFundAmount);
            await acceptor.setUp(initialTokenFundAmount);
            let challengeAddress = initiator.challengeAddress;
            await initiator.newChallenge(initiatorWagerTokenAmountBigNumber);
            console.log("new challenge created");
    
            // challenge created, now accept the challenge
            await acceptor.acceptChallenge(challengeAddress, acceptorWagerTokenAmountBigNumber);

            console.log('challenge accepted');

            // challenge accepted, now reveal the winner
            let revealTx = await acceptor.revealWinner(
                challengeAddress,
                initiator.initiatorTokensVaultAddress,
                initiator.tokensMintPublickey,
                initiator.initiatorTokensVaultBump);

            console.log("winner revealed");
            // let challengeData = await program.account.challenge.fetch(challengeAddress);
            // console.log("challenge data fetched: " + challengeData);
            // let [, tokenSourceAmount] = await readTokenAccount(acceptor.acceptorTokensSource.address, acceptorSession.provider);
            // console.log("token source amount retrieved: " + tokenSourceAmount);

            // const acceptorTokensVault = await spl.getAccount(
            //     acceptorSession.provider.connection,
            //     acceptor.acceptorTokensVaultAddress
            // );

            // console.log(challengeData);
            // console.log(challengeAddress.toString());
    
            // expect(challengeData.initiator.toString(), "initiator owner remains instantiator.")
            //     .equals(initiator.session.userKeypair.publicKey.toString());
            // expect(challengeData.acceptor.toString(), "acceptor now set to accepting user's public key.")
            //     .equals(acceptor.session.userKeypair.publicKey.toString());
            // expect(challengeData.initiatorWagerTokenAmount.toNumber()).equals(initiatorWagerTokenAmount);
            // expect(challengeData.acceptorTokensVault.toString()).equals(acceptor.acceptorTokensVaultAddress.toString());
            // expect(tokenSourceAmount, "Token source should be initial amount minus the amount bet in the wager.")
            //     .equals(`${initialTokenFundAmount - acceptorWagerTokenAmount}`);
            // expect(Number(acceptorTokensVault.amount), "Acceptor tokens vault should have the wager amount deposited in it.")
            //     .equals(Number(acceptorWagerTokenAmount));
        });
    });
});
