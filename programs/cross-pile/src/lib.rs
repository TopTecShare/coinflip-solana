use anchor_lang::prelude::*;
use std::mem::size_of;

declare_id!("2VqrmwwBWQ38zUbJENmEHQfY1LPJZBpuNauVMpZhqMdK");

#[program]
pub mod cross_pile {
    use super::*;

    pub fn new_challenge(
        ctx: Context<NewChallenge>,
        user_bump: u8,
        wager_amount: u64,
    ) -> ProgramResult {
        let challenge = &mut ctx.accounts.challenge;
        challenge.initiator = *ctx.accounts.initiator.to_account_info().key;
        challenge.wager_amount = wager_amount;
        challenge.bump = user_bump;
        Ok(())
    }

    pub fn accept_challenge(
        ctx: Context<AcceptChallenge>,
    ) -> ProgramResult {
        let challenge = &mut ctx.accounts.challenge;

        // should make sure no one has already accepted the challenge
        challenge.acceptor = *ctx.accounts.acceptor.to_account_info().key;
        Ok(())
    }
}

#[account]
pub struct Challenge {
    pub initiator: Pubkey,
    pub acceptor: Pubkey,
    pub wager_amount: u64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct NewChallenge<'info> {
    #[account(
        init,
        payer= initiator,
        space=8+size_of::<Challenge>(),
        seeds=[b"challenge", initiator.to_account_info().key.as_ref()],
        bump
    )]
    pub challenge: Account<'info, Challenge>,
    #[account(mut)]
    pub initiator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AcceptChallenge<'info> {
    #[account(mut)]
    pub challenge: Account<'info, Challenge>,
    //pub acceptor_pub_key: Pubkey,
    // /// CHECK: Unsafe for some reason
    // pub initiator: AccountInfo<'info>,
    pub acceptor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// #[error]
// pub enum ErrorCode {
//     #[msg("You are not authorized to complete this transaction")]
//     Unauthorized,
//     #[msg("The coin is has already been flipped")]
//     AlreadyCompleted,
//     #[msg("A coin is already flipping. Only one flip may be made at a time")]
//     InflightRequest,
//     #[msg("The Oracle has not provided a response yet")]
//     OracleNotCompleted,
// }