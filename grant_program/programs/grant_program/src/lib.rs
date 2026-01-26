#![allow(deprecated)]

use anchor_lang::prelude::*;

declare_id!("8SVRtAyWXcd47PKeeMSGpC1oQFNt2yM865M46QgjKUZ");
use anchor_spl::token::{
    close_account,
    transfer_checked,
    CloseAccount,
    Mint,
    Token,
    TokenAccount,
    TransferChecked,
};

// ===== we-ne (MVP) =====
// SPLトークン限定 / 固定レート方式
// - 1 token = 1円相当（運用ルール。オンチェーンで価格参照はしない）
// - 月次（暫定：30日）で1回だけclaimできる
// - 可変はサブスクの「プラン（tier）」で後から拡張

pub const DEFAULT_MONTH_SECONDS: i64 = 2_592_000; // 30 days

#[program]
pub mod grant_program {
    use super::*;

    /// Grant（給付キャンペーン）を作成する
    /// - mint: 配布するSPLトークン
    /// - amount_per_period: 1期間あたりの配布量（最小単位）
    /// - period_seconds: 期間秒（MVPは月次=2,592,000を推奨）
    /// - start_ts: 期間計算の起点（unix timestamp）
    /// - expires_at: 期限（0なら無期限）
    ///
    /// NOTE: 固定レート方式のため「円換算」はオフチェーン運用ルール。
    pub fn create_grant(
        ctx: Context<CreateGrant>,
        grant_id: u64,
        amount_per_period: u64,
        period_seconds: i64,
        start_ts: i64,
        expires_at: i64,
    ) -> Result<()> {
        require!(amount_per_period > 0, ErrorCode::InvalidAmount);
        require!(period_seconds > 0, ErrorCode::InvalidPeriod);

        let now = Clock::get()?.unix_timestamp;
        // start_tsは未来でも良い（開始前にfundしておく想定）
        // ただし極端に昔すぎるのはミスの可能性があるので軽く制限
        require!(start_ts <= now + 365_i64 * 24 * 60 * 60, ErrorCode::InvalidStartTs);

        let grant = &mut ctx.accounts.grant;
        grant.authority = ctx.accounts.authority.key();
        grant.mint = ctx.accounts.mint.key();
        grant.vault = ctx.accounts.vault.key();
        grant.grant_id = grant_id;
        grant.amount_per_period = amount_per_period;
        grant.period_seconds = period_seconds;
        grant.start_ts = start_ts;
        grant.expires_at = expires_at;
        // allowlist is optional; default is disabled
        grant.merkle_root = [0u8; 32];
        grant.paused = false;
        grant.bump = ctx.bumps.grant;

        Ok(())
    }

    /// 原資入金（追加入金も可能）
    pub fn fund_grant(ctx: Context<FundGrant>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);

        // mint整合性
        require!(ctx.accounts.grant.mint == ctx.accounts.mint.key(), ErrorCode::MintMismatch);
        require!(ctx.accounts.vault.mint == ctx.accounts.mint.key(), ErrorCode::MintMismatch);

        let decimals = ctx.accounts.mint.decimals;

        let cpi_accounts = TransferChecked {
            from: ctx.accounts.from_ata.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.funder.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        transfer_checked(cpi_ctx, amount, decimals)
    }

    /// 受給（期間内1回のみ）
    pub fn claim_grant(ctx: Context<ClaimGrant>, period_index: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let grant = &ctx.accounts.grant;

        require!(!grant.paused, ErrorCode::Paused);
        // allowlist が有効な場合は proof 付きの claim を要求
        require!(grant.merkle_root == [0u8; 32], ErrorCode::AllowlistRequired);

        require_claim_timing(grant, now, period_index)?;
        // receipt PDA の seed に period_index が含まれているため
        // 同じ期間に2回目のclaimをしようとすると init が失敗し、二重受給が防げる
        // （receipt作成は Accounts 側で init される）

        transfer_from_vault(
            &ctx.accounts.grant,
            &ctx.accounts.vault,
            &ctx.accounts.mint,
            &ctx.accounts.claimer_ata,
            &ctx.accounts.token_program,
            grant.amount_per_period,
        )?;
        record_receipt(
            &mut ctx.accounts.receipt,
            grant.key(),
            ctx.accounts.claimer.key(),
            period_index,
            now,
        );

        Ok(())
    }

    /// 終了・返金（vaultの残高を回収し、vaultをcloseする）
    pub fn close_grant(ctx: Context<CloseGrant>) -> Result<()> {
        let grant = &ctx.accounts.grant;

        // 残高があるなら返金
        let remaining = ctx.accounts.vault.amount;
        if remaining > 0 {
            let grant_seeds: &[&[u8]] = &[
                b"grant",
                grant.authority.as_ref(),
                grant.mint.as_ref(),
                &grant.grant_id.to_le_bytes(),
                &[grant.bump],
            ];

            let decimals = ctx.accounts.mint.decimals;

            let cpi_accounts = TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.authority_ata.to_account_info(),
                authority: ctx.accounts.grant.to_account_info(),
            };
            let signer_seeds: &[&[&[u8]]] = &[grant_seeds];
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                signer_seeds,
            );
            transfer_checked(cpi_ctx, remaining, decimals)?;
        }

        // vault を close（rent回収）
        {
            let grant_seeds: &[&[u8]] = &[
                b"grant",
                grant.authority.as_ref(),
                grant.mint.as_ref(),
                &grant.grant_id.to_le_bytes(),
                &[grant.bump],
            ];

            let cpi_accounts = CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.authority.to_account_info(),
                authority: ctx.accounts.grant.to_account_info(),
            };
            let signer_seeds: &[&[&[u8]]] = &[grant_seeds];
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                signer_seeds,
            );
            close_account(cpi_ctx)?;
        }

        // Grantアカウント自体は Accounts で close される
        Ok(())
    }

    /// 一時停止/再開（運用自由度）
    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        let grant = &mut ctx.accounts.grant;
        grant.paused = paused;
        Ok(())
    }

    /// allowlist を設定（任意）
    /// - merkle_root が [0;32] の場合は allowlist 無効（誰でも受給可能）
    /// - それ以外の場合は allowlist 有効（proof を伴う claim が必要）
    pub fn set_allowlist_root(ctx: Context<SetAllowlistRoot>, merkle_root: [u8; 32]) -> Result<()> {
        let grant = &mut ctx.accounts.grant;
        grant.merkle_root = merkle_root;
        Ok(())
    }

    /// allowlist（Merkle）を用いた受給
    /// - Grant に merkle_root が設定されている場合はこちらを使用
    pub fn claim_grant_with_proof(
        ctx: Context<ClaimGrant>,
        period_index: u64,
        proof: Vec<[u8; 32]>,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let grant = &ctx.accounts.grant;

        require!(!grant.paused, ErrorCode::Paused);

        // allowlist が無効なら通常の claim を使えばよい
        require!(grant.merkle_root != [0u8; 32], ErrorCode::AllowlistNotEnabled);

        // Merkle allowlist verify
        let leaf = allowlist_leaf(ctx.accounts.claimer.key());
        require!(
            verify_merkle_sorted(grant.merkle_root, leaf, &proof),
            ErrorCode::NotInAllowlist
        );

        require_claim_timing(grant, now, period_index)?;
        transfer_from_vault(
            &ctx.accounts.grant,
            &ctx.accounts.vault,
            &ctx.accounts.mint,
            &ctx.accounts.claimer_ata,
            &ctx.accounts.token_program,
            grant.amount_per_period,
        )?;
        record_receipt(
            &mut ctx.accounts.receipt,
            grant.key(),
            ctx.accounts.claimer.key(),
            period_index,
            now,
        );

        Ok(())
    }
}

// ===== Accounts =====

#[derive(Accounts)]
#[instruction(grant_id: u64)]
pub struct CreateGrant<'info> {
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + Grant::INIT_SPACE,
        seeds = [b"grant", authority.key().as_ref(), mint.key().as_ref(), &grant_id.to_le_bytes()],
        bump
    )]
    pub grant: Account<'info, Grant>,

    pub mint: Account<'info, Mint>,

    /// Program-owned vault (TokenAccount). Authority is the grant PDA.
    #[account(
        init_if_needed,
        payer = authority,
        token::mint = mint,
        token::authority = grant,
        seeds = [b"vault", grant.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct FundGrant<'info> {
    #[account(
        mut,
        has_one = authority,
        seeds = [b"grant", authority.key().as_ref(), mint.key().as_ref(), &grant.grant_id.to_le_bytes()],
        bump = grant.bump
    )]
    pub grant: Account<'info, Grant>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"vault", grant.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,

    /// 入金元（ATAなど）
    #[account(
        mut,
        constraint = from_ata.mint == mint.key() @ ErrorCode::MintMismatch,
        constraint = from_ata.owner == funder.key() @ ErrorCode::Unauthorized
    )]
    pub from_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub funder: Signer<'info>,

    /// Grant作成者（has_oneのため）
    pub authority: SystemAccount<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(period_index: u64)]
pub struct ClaimGrant<'info> {
    #[account(
        mut,
        seeds = [b"grant", grant.authority.as_ref(), grant.mint.as_ref(), &grant.grant_id.to_le_bytes()],
        bump = grant.bump
    )]
    pub grant: Account<'info, Grant>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"vault", grant.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,

    /// 受給者
    #[account(mut)]
    pub claimer: Signer<'info>,

    /// 受給先（ATAなど）
    #[account(
        mut,
        constraint = claimer_ata.mint == mint.key() @ ErrorCode::MintMismatch,
        constraint = claimer_ata.owner == claimer.key() @ ErrorCode::Unauthorized
    )]
    pub claimer_ata: Account<'info, TokenAccount>,

    /// 期間内1回の受給を保証するレシート
    #[account(
        init_if_needed,
        payer = claimer,
        space = 8 + ClaimReceipt::INIT_SPACE,
        seeds = [
            b"receipt",
            grant.key().as_ref(),
            claimer.key().as_ref(),
            &period_index.to_le_bytes(),
        ],
        bump
    )]
    pub receipt: Account<'info, ClaimReceipt>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct CloseGrant<'info> {
    #[account(
        mut,
        has_one = authority,
        close = authority,
        seeds = [b"grant", authority.key().as_ref(), mint.key().as_ref(), &grant.grant_id.to_le_bytes()],
        bump = grant.bump
    )]
    pub grant: Account<'info, Grant>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"vault", grant.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,

    /// 返金先（authorityのATA）
    #[account(
        mut,
        constraint = authority_ata.mint == mint.key() @ ErrorCode::MintMismatch,
        constraint = authority_ata.owner == authority.key() @ ErrorCode::Unauthorized
    )]
    pub authority_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SetPaused<'info> {
    #[account(
        mut,
        has_one = authority,
        seeds = [b"grant", authority.key().as_ref(), mint.key().as_ref(), &grant.grant_id.to_le_bytes()],
        bump = grant.bump
    )]
    pub grant: Account<'info, Grant>,

    pub mint: Account<'info, Mint>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct SetAllowlistRoot<'info> {
    #[account(
        mut,
        has_one = authority,
        seeds = [b"grant", authority.key().as_ref(), mint.key().as_ref(), &grant.grant_id.to_le_bytes()],
        bump = grant.bump
    )]
    pub grant: Account<'info, Grant>,

    pub mint: Account<'info, Mint>,

    pub authority: Signer<'info>,
}

// ===== State =====

#[account]
pub struct Grant {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub grant_id: u64,

    pub amount_per_period: u64,
    pub period_seconds: i64,
    pub start_ts: i64,
    pub expires_at: i64, // 0 = no expiry

    /// allowlist Merkle root. [0;32] means disabled.
    pub merkle_root: [u8; 32],

    pub paused: bool,
    pub bump: u8,
}

impl Grant {
    pub const INIT_SPACE: usize =
        32 + 32 + 32 + 8 + // keys + grant_id
        8 + 8 + 8 + 8 +    // amounts/timestamps
        32 +               // merkle_root
        1 + 1;             // paused + bump
}

#[account]
pub struct ClaimReceipt {
    pub grant: Pubkey,
    pub claimer: Pubkey,
    pub period_index: u64,
    pub claimed_at: i64,
}

impl ClaimReceipt {
    pub const INIT_SPACE: usize = 32 + 32 + 8 + 8;
}

// ===== Helpers =====

fn require_claim_timing(grant: &Grant, now: i64, period_index: u64) -> Result<()> {
    if grant.expires_at != 0 {
        require!(now <= grant.expires_at, ErrorCode::GrantExpired);
    }

    require!(now >= grant.start_ts, ErrorCode::GrantNotStarted);

    // period_index はクライアントから渡される（receipt PDA の seed 用）
    // 不正防止のため、オンチェーンで現在の period_index を再計算して一致を要求
    let elapsed = now
        .checked_sub(grant.start_ts)
        .ok_or(ErrorCode::MathOverflow)?;
    let expected_period_index = (elapsed / grant.period_seconds) as u64;
    require!(period_index == expected_period_index, ErrorCode::InvalidPeriodIndex);

    Ok(())
}

fn transfer_from_vault<'info>(
    grant_account: &Account<'info, Grant>,
    vault: &Account<'info, TokenAccount>,
    mint: &Account<'info, Mint>,
    destination: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    amount: u64,
) -> Result<()> {
    require!(vault.amount >= amount, ErrorCode::InsufficientFunds);

    let grant_id_bytes = grant_account.grant_id.to_le_bytes();
    let grant_seeds: &[&[u8]] = &[
        b"grant",
        grant_account.authority.as_ref(),
        grant_account.mint.as_ref(),
        &grant_id_bytes,
        &[grant_account.bump],
    ];

    let decimals = mint.decimals;

    let cpi_accounts = TransferChecked {
        from: vault.to_account_info(),
        mint: mint.to_account_info(),
        to: destination.to_account_info(),
        authority: grant_account.to_account_info(),
    };
    let signer_seeds: &[&[&[u8]]] = &[grant_seeds];
    let cpi_ctx = CpiContext::new_with_signer(token_program.to_account_info(), cpi_accounts, signer_seeds);
    transfer_checked(cpi_ctx, amount, decimals)
}

fn record_receipt(
    receipt: &mut Account<ClaimReceipt>,
    grant: Pubkey,
    claimer: Pubkey,
    period_index: u64,
    claimed_at: i64,
) {
    receipt.grant = grant;
    receipt.claimer = claimer;
    receipt.period_index = period_index;
    receipt.claimed_at = claimed_at;
}


// ===== Allowlist (Merkle) helpers =====

/// Domain-separated leaf hash for allowlist membership.
/// leaf = sha256( "we-ne:allowlist" || claimer_pubkey )
fn allowlist_leaf(claimer: Pubkey) -> [u8; 32] {
    use anchor_lang::solana_program::hash::hashv;
    let h = hashv(&[b"we-ne:allowlist", claimer.as_ref()]);
    h.to_bytes()
}

/// Verifies a Merkle proof using *sorted pair hashing* (no left/right flag).
/// Each step: parent = sha256( min(a,b) || max(a,b) )
///
/// IMPORTANT: Off-chain Merkle tree builder must use the same sorted-pair rule.
fn verify_merkle_sorted(root: [u8; 32], leaf: [u8; 32], proof: &[[u8; 32]]) -> bool {
    use anchor_lang::solana_program::hash::hashv;

    let mut computed = leaf;
    for p in proof.iter() {
        let (left, right) = if computed <= *p { (computed, *p) } else { (*p, computed) };
        let h = hashv(&[left.as_ref(), right.as_ref()]);
        computed = h.to_bytes();
    }
    computed == root
}

// ===== Errors =====

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Invalid period")]
    InvalidPeriod,
    #[msg("Invalid start timestamp")]
    InvalidStartTs,
    #[msg("Invalid period index")]
    InvalidPeriodIndex,
    #[msg("Mint mismatch")]
    MintMismatch,
    #[msg("Grant is paused")]
    Paused,
    #[msg("Grant expired")]
    GrantExpired,
    #[msg("Grant not started")]
    GrantNotStarted,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Allowlist is required for this grant")]
    AllowlistRequired,
    #[msg("Allowlist is not enabled")]
    AllowlistNotEnabled,
    #[msg("Claimer is not in allowlist")]
    NotInAllowlist,
}