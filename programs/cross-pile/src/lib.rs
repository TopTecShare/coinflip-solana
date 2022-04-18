use anchor_lang::prelude::*;
use std::mem::size_of;
use anchor_spl::token::{self, CloseAccount, Mint, Token, SetAuthority, TokenAccount, Transfer};
use spl_token::instruction::AuthorityType;

declare_id!("2VqrmwwBWQ38zUbJENmEHQfY1LPJZBpuNauVMpZhqMdK");

#[program]
pub mod cross_pile {
    use super::*;

    pub fn new_challenge(
        ctx: Context<NewChallenge>,
        challenge_bump: u8,
        initiator_tokens_vault_bump: u8,
        initiator_wager_token_amount: u64,
    ) -> Result<()> {
        // initialize the challenge with information provided by the initiator
        let challenge = &mut ctx.accounts.challenge;
        challenge.initiator = ctx.accounts.initiator.to_account_info().key.clone();
        challenge.initiator_tokens_mint = ctx.accounts.initiator_tokens_mint.to_account_info().key.clone();
        challenge.initiator_tokens_vault = ctx.accounts.initiator_tokens_vault.to_account_info().key.clone();
        challenge.initiator_wager_token_amount = initiator_wager_token_amount;
        challenge.bump = challenge_bump;

        // move the tokens in the wager from the initiator's token source to the token vault
        let initiator_tokens_vault = &mut ctx.accounts.initiator_tokens_vault;

        anchor_spl::token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx
                        .accounts
                        .initiator_tokens_source
                        .to_account_info(),
                    to: ctx
                        .accounts
                        .initiator_tokens_vault
                        .to_account_info(),
                    authority: ctx.accounts.initiator.to_account_info(),
                },
            ),
            initiator_wager_token_amount,
        )?;

        Ok(())
    }

    pub fn accept_challenge(
        ctx: Context<AcceptChallenge>,
        acceptor_tokens_vault_bump: u8,
        acceptor_wager_token_amount: u64,
    ) -> Result<()> {
        let challenge = &mut ctx.accounts.challenge;
        // should make sure no one has already accepted the challenge
        challenge.acceptor = *ctx.accounts.acceptor.to_account_info().key;
        challenge.acceptor_tokens_mint = ctx.accounts.acceptor_tokens_mint.to_account_info().key.clone();
        challenge.acceptor_tokens_vault = ctx.accounts.acceptor_tokens_vault.to_account_info().key.clone();
        challenge.acceptor_wager_token_amount = acceptor_wager_token_amount;

        // move the tokens in the wager from the acceptor's token source to the token vault
        let acceptor_tokens_vault = &mut ctx.accounts.acceptor_tokens_vault;

        anchor_spl::token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx
                        .accounts
                        .acceptor_tokens_source
                        .to_account_info(),
                    to: ctx
                        .accounts
                        .acceptor_tokens_vault
                        .to_account_info(),
                    authority: ctx.accounts.acceptor.to_account_info(),
                },
            ),
            acceptor_wager_token_amount,
        )?;

        Ok(())
    }

    pub fn reveal_winner(
        ctx: Context<RevealWinner>,
        initiator_tokens_vault_bump: u8,
    ) -> Result<()> {
        msg!("here");
        let initiatorVaultSeeds = &[
            b"initiator_tokens_vault".as_ref(),
            ctx.accounts.challenge.initiator.as_ref(),
            &[initiator_tokens_vault_bump],
        ];
        let challengeSeeds = &[
            b"challenge",
            ctx.accounts.challenge.initiator.as_ref(),
            &[ctx.accounts.challenge.bump]
        ];
        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx
                        .accounts
                        .initiator_tokens_vault
                        .to_account_info(),
                    to: ctx
                        .accounts
                        .acceptor_other_tokens_taker
                        .to_account_info(),
                    authority: ctx
                        .accounts
                        .challenge
                        .to_account_info(),
                },
                &[&challengeSeeds[..]],
            ),
            ctx.accounts.challenge.initiator_wager_token_amount,
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct RevealWinner<'info> {
    #[account(mut)]
    pub challenge: Account<'info, Challenge>,

    #[account(mut)]
    initiator_tokens_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    acceptor_tokens_vault: Account<'info, TokenAccount>,

    // accounts to receive the bet back into
    // account to receive acceptor's own bet back into
    #[account(mut)]
    acceptor_own_tokens_taker: Account<'info, TokenAccount>,
    // account to receive initiator's bet into
    #[account(mut)]
    acceptor_other_tokens_taker: Account<'info, TokenAccount>,

    // Application level accounts
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}


// PDA that holds the state of the challenge
#[account]
pub struct Challenge {
    pub initiator: Pubkey,
    pub initiator_tokens_mint: Pubkey,
    pub initiator_tokens_vault: Pubkey,
    pub initiator_wager_token_amount: u64,
    pub acceptor: Pubkey,
    pub acceptor_tokens_mint: Pubkey,
    pub acceptor_tokens_vault: Pubkey,
    pub acceptor_wager_token_amount: u64,
    pub bump: u8,
}

// arguments list for new_challenge
#[derive(Accounts)]
pub struct NewChallenge<'info> {
    #[account(mut)]
    pub initiator: Signer<'info>,

    // PDAs
    #[account(
        init,
        payer = initiator,
        space = 8 + size_of::<Challenge>(),
        seeds = [b"challenge", initiator.to_account_info().key.as_ref()],
        bump
    )]
    pub challenge: Account<'info, Challenge>,

    // account to transfer initiator's wager tokens to
    #[account(
        init,
        payer = initiator,
        seeds = [b"initiator_tokens_vault".as_ref(), initiator.to_account_info().key.as_ref()],
        bump,
        token::mint=initiator_tokens_mint,
        token::authority=challenge,
    )]
    initiator_tokens_vault: Account<'info, TokenAccount>,

    // Mint of the wager that the person creating the challenge is putting up
    pub initiator_tokens_mint: Account<'info, Mint>,

    // Where to withdraw the intiator's wager tokens from
    #[account(mut)]
    pub initiator_tokens_source: Account<'info, TokenAccount>,
    
    // Application level accounts
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct AcceptChallenge<'info> {
    #[account(mut)]
    pub acceptor: Signer<'info>,
    #[account(mut)]
    pub challenge: Account<'info, Challenge>,

    // account to transfer acceptor's wager tokens to
    #[account(
        init,
        payer = acceptor,
        seeds = [b"acceptor_tokens_vault".as_ref(), acceptor.to_account_info().key.as_ref()],
        bump,
        token::mint=acceptor_tokens_mint,
        token::authority=challenge,
    )]
    acceptor_tokens_vault: Account<'info, TokenAccount>,

    // Mint of the wager that the person accepting the challenge is putting up
    pub acceptor_tokens_mint: Account<'info, Mint>,

    // Where to withdraw the acceptor's wager tokens from
    #[account(mut)]
    pub acceptor_tokens_source: Account<'info, TokenAccount>,
    
    // Application level accounts
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
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