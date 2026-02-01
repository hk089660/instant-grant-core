import fs from "fs";
import path from "path";

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

// NOTE: target/types のファイル名は snake_case です
import { GrantProgram } from "../target/types/grant_program";

import { strict as assert } from "assert";

function u64LE(n: anchor.BN): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n.toString()), 0);
  return b;
}

describe("grant_program (PDA)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // NOTE:
  // workspace 名のズレや、古いIDLを読んでしまう問題を避けるため、
  // target/idl の JSON を直接読み込んで Program を生成する。

  const idlPath = path.resolve(__dirname, "../target/idl/grant_program.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));

  // Anchor v0.31 では Program コンストラクタの第2引数は Provider なので、
  // programId は IDL の metadata.address から自動で拾わせる。
  const program = new Program(idl as any, provider) as Program<GrantProgram>;

  // （任意）IDL から programId を取り出して確認したい場合
  // const programId = new PublicKey((idl?.metadata?.address ?? idl?.address) as string);
  // assert.ok(program.programId.equals(programId));

  it("create_grant stores amount_per_period (PDA)", async () => {
    const authority = provider.wallet as anchor.Wallet;

    // Create a test mint
    const mint = await createMint(
      provider.connection,
      authority.payer,
      authority.publicKey,
      null,
      6
    );

    const grantId = new anchor.BN(1);
    const amountPerPeriod = new anchor.BN(1_000);
    const periodSeconds = new anchor.BN(60); // 60s period
    const startTs = new anchor.BN(Math.floor(Date.now() / 1000) - 5);
    const expiresAt = new anchor.BN(0);

    const [grantPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("grant"),
        authority.publicKey.toBuffer(),
        mint.toBuffer(),
        u64LE(grantId),
      ],
      program.programId
    );

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), grantPda.toBuffer()],
      program.programId
    );

    await program.methods
      .createGrant(grantId, amountPerPeriod, periodSeconds, startTs, expiresAt)
      .accounts({
        grant: grantPda,
        mint,
        vault: vaultPda,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      } as any)
      .rpc();

    const grantAccount = await (program.account as any).grant.fetch(grantPda);
    assert.equal(grantAccount.amountPerPeriod.toString(), amountPerPeriod.toString());
    assert.equal(grantAccount.mint.toBase58(), mint.toBase58());
    assert.equal(grantAccount.authority.toBase58(), authority.publicKey.toBase58());
    assert.equal(grantAccount.vault.toBase58(), vaultPda.toBase58());
  });

  it("fund_grant increases vault balance (PDA)", async () => {
    const authority = provider.wallet as anchor.Wallet;

    const mint = await createMint(
      provider.connection,
      authority.payer,
      authority.publicKey,
      null,
      6
    );

    const grantId = new anchor.BN(2);
    const amountPerPeriod = new anchor.BN(1_000);
    const periodSeconds = new anchor.BN(60);
    const startTs = new anchor.BN(Math.floor(Date.now() / 1000) - 5);
    const expiresAt = new anchor.BN(0);

    const [grantPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("grant"),
        authority.publicKey.toBuffer(),
        mint.toBuffer(),
        u64LE(grantId),
      ],
      program.programId
    );

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), grantPda.toBuffer()],
      program.programId
    );

    await program.methods
      .createGrant(grantId, amountPerPeriod, periodSeconds, startTs, expiresAt)
      .accounts({
        grant: grantPda,
        mint,
        vault: vaultPda,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      } as any)
      .rpc();

    const fromAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      authority.payer,
      mint,
      authority.publicKey
    );

    const fundAmount = BigInt(5_000);
    await mintTo(
      provider.connection,
      authority.payer,
      mint,
      fromAta.address,
      authority.publicKey,
      fundAmount
    );

    const beforeVault = await getAccount(provider.connection, vaultPda).catch(() => null);
    const beforeAmount = beforeVault ? beforeVault.amount : BigInt(0);

    await program.methods
      .fundGrant(new anchor.BN(fundAmount.toString()))
      .accounts({
        grant: grantPda,
        mint,
        vault: vaultPda,
        fromAta: fromAta.address,
        funder: authority.publicKey,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .rpc();

    const afterVault = await getAccount(provider.connection, vaultPda);
    assert.equal(afterVault.amount, beforeAmount + fundAmount);
  });

  it("claimer can claim once per period (PDA)", async () => {
    const authority = provider.wallet as anchor.Wallet;

    const claimer = anchor.web3.Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      claimer.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");

    const mint = await createMint(
      provider.connection,
      authority.payer,
      authority.publicKey,
      null,
      6
    );

    const grantId = new anchor.BN(3);
    const amountPerPeriod = new anchor.BN(1_000);
    const periodSeconds = new anchor.BN(60);
    const startTs = new anchor.BN(Math.floor(Date.now() / 1000) - 5);
    const expiresAt = new anchor.BN(0);

    const [grantPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("grant"),
        authority.publicKey.toBuffer(),
        mint.toBuffer(),
        u64LE(grantId),
      ],
      program.programId
    );

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), grantPda.toBuffer()],
      program.programId
    );

    await program.methods
      .createGrant(grantId, amountPerPeriod, periodSeconds, startTs, expiresAt)
      .accounts({
        grant: grantPda,
        mint,
        vault: vaultPda,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      } as any)
      .rpc();

    const fromAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      authority.payer,
      mint,
      authority.publicKey
    );

    const fundAmount = BigInt(10_000);
    await mintTo(
      provider.connection,
      authority.payer,
      mint,
      fromAta.address,
      authority.publicKey,
      fundAmount
    );

    await program.methods
      .fundGrant(new anchor.BN(fundAmount.toString()))
      .accounts({
        grant: grantPda,
        mint,
        vault: vaultPda,
        fromAta: fromAta.address,
        funder: authority.publicKey,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .rpc();

    const claimerAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      authority.payer,
      mint,
      claimer.publicKey
    );

    const periodIndex = new anchor.BN(0);

    const [receiptPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("receipt"),
        grantPda.toBuffer(),
        claimer.publicKey.toBuffer(),
        u64LE(periodIndex),
      ],
      program.programId
    );

    await program.methods
      .claimGrant(periodIndex)
      .accounts({
        grant: grantPda,
        mint,
        vault: vaultPda,
        claimer: claimer.publicKey,
        claimerAta: claimerAta.address,
        receipt: receiptPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      } as any)
      .signers([claimer])
      .rpc();

    const after1 = await getAccount(provider.connection, claimerAta.address);
    assert.equal(after1.amount, BigInt(amountPerPeriod.toString()));

    // same period claim should fail (receipt already exists)
    let threw = false;
    try {
      await program.methods
        .claimGrant(periodIndex)
        .accounts({
          grant: grantPda,
          mint,
          vault: vaultPda,
          claimer: claimer.publicKey,
          claimerAta: claimerAta.address,
          receipt: receiptPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        } as any)
        .signers([claimer])
        .rpc();
    } catch (_) {
      threw = true;
    }
    assert.equal(threw, true);
  });

  // SECURITY_REVIEW P1: set_paused 後の claim 拒否
  it("claim_grant fails when grant is paused", async () => {
    const authority = provider.wallet as anchor.Wallet;
    const claimer = anchor.web3.Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      claimer.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");

    const mint = await createMint(
      provider.connection,
      authority.payer,
      authority.publicKey,
      null,
      6
    );

    const grantId = new anchor.BN(4);
    const amountPerPeriod = new anchor.BN(1_000);
    const periodSeconds = new anchor.BN(60);
    const startTs = new anchor.BN(Math.floor(Date.now() / 1000) - 5);
    const expiresAt = new anchor.BN(0);

    const [grantPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("grant"),
        authority.publicKey.toBuffer(),
        mint.toBuffer(),
        u64LE(grantId),
      ],
      program.programId
    );

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), grantPda.toBuffer()],
      program.programId
    );

    await program.methods
      .createGrant(grantId, amountPerPeriod, periodSeconds, startTs, expiresAt)
      .accounts({
        grant: grantPda,
        mint,
        vault: vaultPda,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      } as any)
      .rpc();

    await program.methods
      .setPaused(true)
      .accounts({
        grant: grantPda,
        mint,
        authority: authority.publicKey,
      } as any)
      .rpc();

    const claimerAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      authority.payer,
      mint,
      claimer.publicKey
    );

    const periodIndex = new anchor.BN(0);
    const [receiptPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("receipt"),
        grantPda.toBuffer(),
        claimer.publicKey.toBuffer(),
        u64LE(periodIndex),
      ],
      program.programId
    );

    let threw = false;
    try {
      await program.methods
        .claimGrant(periodIndex)
        .accounts({
          grant: grantPda,
          mint,
          vault: vaultPda,
          claimer: claimer.publicKey,
          claimerAta: claimerAta.address,
          receipt: receiptPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        } as any)
        .signers([claimer])
        .rpc();
    } catch (_) {
      threw = true;
    }
    assert.equal(threw, true, "claim_grant must fail when paused");
  });

  // SECURITY_REVIEW P1: authority 以外は set_paused 不可
  it("set_paused rejects when signer is not grant authority", async () => {
    const authority = provider.wallet as anchor.Wallet;
    const other = anchor.web3.Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      other.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");

    const mint = await createMint(
      provider.connection,
      authority.payer,
      authority.publicKey,
      null,
      6
    );

    const grantId = new anchor.BN(5);
    const amountPerPeriod = new anchor.BN(1_000);
    const periodSeconds = new anchor.BN(60);
    const startTs = new anchor.BN(Math.floor(Date.now() / 1000) - 5);
    const expiresAt = new anchor.BN(0);

    const [grantPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("grant"),
        authority.publicKey.toBuffer(),
        mint.toBuffer(),
        u64LE(grantId),
      ],
      program.programId
    );

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), grantPda.toBuffer()],
      program.programId
    );

    await program.methods
      .createGrant(grantId, amountPerPeriod, periodSeconds, startTs, expiresAt)
      .accounts({
        grant: grantPda,
        mint,
        vault: vaultPda,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      } as any)
      .rpc();

    let threw = false;
    try {
      await program.methods
        .setPaused(true)
        .accounts({
          grant: grantPda,
          mint,
          authority: other.publicKey,
        } as any)
        .signers([other])
        .rpc();
    } catch (_) {
      threw = true;
    }
    assert.equal(threw, true, "set_paused must fail when signer is not grant authority");
  });
});