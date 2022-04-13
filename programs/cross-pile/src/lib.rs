use anchor_lang::prelude::*;
use std::mem::size_of;
use anchor_spl::token::{self, CloseAccount, Mint, SetAuthority, TokenAccount, Transfer};

declare_id!("2VqrmwwBWQ38zUbJENmEHQfY1LPJZBpuNauVMpZhqMdK");

#[program]
pub mod cross_pile {
    use super::*;

    pub fn new_challenge(
        ctx: Context<NewChallenge>,
        challenge_bump: u8,
        wager_token_amount: u64,
    ) -> Result<()> {
        let challenge = &mut ctx.accounts.challenge;
        challenge.initiator = *ctx.accounts.initiator.to_account_info().key;
        challenge.initiator_tokens_mint = *ctx.accounts.initiator_tokens_mint.to_account_info().key;
        challenge.wager_token_amount = wager_token_amount;
        challenge.bump = challenge_bump;
        Ok(())
    }

    pub fn accept_challenge(
        ctx: Context<AcceptChallenge>,
    ) -> Result<()> {
        let challenge = &mut ctx.accounts.challenge;

        // should make sure no one has already accepted the challenge
        challenge.acceptor = *ctx.accounts.acceptor.to_account_info().key;
        Ok(())
    }
}

// PDA that holds the state of the challenge
#[account]
pub struct Challenge {
    pub initiator: Pubkey,
    pub initiator_tokens_mint: Pubkey,
    pub acceptor: Pubkey,
    pub wager_token_amount: u64,
    pub bump: u8,
}

// arguments list for new_challenge
#[derive(Accounts)]
pub struct NewChallenge<'info> {
    #[account(
        init,
        payer=initiator,
        space=8+size_of::<Challenge>(),
        seeds=[b"challenge", initiator.to_account_info().key.as_ref()],
        bump
    )]
    pub challenge: Account<'info, Challenge>,
    pub initiator_tokens_mint: Account<'info, Mint>,
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