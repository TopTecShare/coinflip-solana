use anchor_lang::prelude::*;
use std::mem::size_of;
use anchor_spl::token::{self, CloseAccount, Mint, Token, SetAuthority, TokenAccount, Transfer};
use spl_token::instruction::AuthorityType;

declare_id!("2VqrmwwBWQ38zUbJENmEHQfY1LPJZBpuNauVMpZhqMdK");

#[program]
pub mod cross_pile {
    use super::*;

    const ESCROW_PDA_SEED: &[u8] = b"escrow";

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

        let initiator_tokens_vault = &mut ctx.accounts.initiator_tokens_vault;

        // I don't fully understand this whole inner/outer nonsense to get the signer seeds to be arranged correctly
        // let bump_vector = challenge_bump.to_le_bytes();
        // let inner = vec![
        //     ctx.accounts.initiator_tokens_mint.to_account_info().key.as_ref(),
        //     ctx.accounts.initiator.to_account_info().key.as_ref(),
        //     // b"challenge".as_ref(),
        //     // bump_vector.as_ref(),
        // ];
        // let outer = vec![inner.as_slice()];
        
        // let transfer_from_initiator_source_to_vault_instruction = Transfer{
        //     from: ctx.accounts.initiator_tokens_source.to_account_info(),
        //     to: initiator_tokens_vault.to_account_info(),
        //     authority: ctx.accounts.initiator.to_account_info(),
        // };
        // let cpi_ctx = CpiContext::new_with_signer(
        //     ctx.accounts.token_program.to_account_info(),
        //     transfer_from_initiator_source_to_vault_instruction,
        //     outer.as_slice(),
        // );

        // The `?` at the end will cause the function to return early in case of an error.
        // This pattern is common in Rust.
        // anchor_spl::token::transfer(cpi_ctx, initiator_wager_token_amount)?;

        let (pda, _bump_seed) = Pubkey::find_program_address(&[ESCROW_PDA_SEED], ctx.program_id);
        let seeds = &[&ESCROW_PDA_SEED[..], &[bump_seed]];
        token::set_authority(ctx.accounts.into(), AuthorityType::AccountOwner, Some(pda))?;

        token::transfer(
            ctx.accounts
                .into_transfer_to_taker_context()
                .with_signer(&[&seeds[..]]),
                initiator_wager_token_amount,
        )?;

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
    pub initiator_tokens_vault: Pubkey,
    pub initiator_wager_token_amount: u64,
    pub acceptor: Pubkey,
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
    pub challenge: Account<'info, Challenge>,
    //pub acceptor_pub_key: Pubkey,
    // /// CHECK: Unsafe for some reason
    // pub initiator: AccountInfo<'info>,
    pub acceptor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

impl<'info> From<&mut NewChallenge<'info>>
    for CpiContext<'_, '_, '_, 'info, SetAuthority<'info>>
{
    fn from(accounts: &mut NewChallenge<'info>) -> Self {
        let cpi_accounts = SetAuthority {
            account_or_mint: accounts
                .initiator_tokens_source
                .to_account_info()
                .clone(),
            current_authority: accounts.initiator.to_account_info().clone(),
        };
        let cpi_program = accounts.token_program.to_account_info();
        CpiContext::new(cpi_program, cpi_accounts)
    }
}

impl<'info> NewChallenge<'info> {
    fn into_transfer_to_taker_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.pda_deposit_token_account.to_account_info().clone(),
            to: self.taker_receive_token_account.to_account_info().clone(),
            authority: self.pda_account.clone(),
        };
        let cpi_program = self.token_program.to_account_info();
        CpiContext::new(cpi_program, cpi_accounts)
    }
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