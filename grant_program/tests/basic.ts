import fs from "fs";
import path from "path";
import { createHash } from "crypto";

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Ed25519Program, PublicKey, SystemProgram } from "@solana/web3.js";
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

const POP_MESSAGE_VERSION_V2 = 2;

function u64LE(n: anchor.BN): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n.toString()), 0);
  return b;
}

function i64LE(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(n, 0);
  return b;
}

function popEntryHash(params: {
  version: number;
  prevHash: Buffer;
  streamPrevHash: Buffer;
  auditHash?: Buffer;
  grant: PublicKey;
  claimer: PublicKey;
  periodIndex: bigint;
  issuedAt: bigint;
}): Buffer {
  const domain = params.version === 2 ? "we-ne:pop:v2" : "we-ne:pop:v1";
  const body: Buffer[] = [
    Buffer.from(domain),
    params.prevHash,
    params.streamPrevHash,
  ];
  if (params.version === 2) {
    body.push(params.auditHash ?? Buffer.alloc(32, 0));
  }
  body.push(
    params.grant.toBuffer(),
    params.claimer.toBuffer(),
    u64LE(new anchor.BN(params.periodIndex.toString())),
    i64LE(params.issuedAt)
  );
  return createHash("sha256").update(Buffer.concat(body)).digest();
}

function buildPopProofMessage(params: {
  version: number;
  grant: PublicKey;
  claimer: PublicKey;
  periodIndex: bigint;
  prevHash: Buffer;
  streamPrevHash: Buffer;
  auditHash?: Buffer;
  entryHash: Buffer;
  issuedAt: bigint;
}): Buffer {
  const message: Buffer[] = [
    Buffer.from([params.version]),
    params.grant.toBuffer(),
    params.claimer.toBuffer(),
    u64LE(new anchor.BN(params.periodIndex.toString())),
    params.prevHash,
    params.streamPrevHash,
  ];
  if (params.version === 2) {
    message.push(params.auditHash ?? Buffer.alloc(32, 0));
  }
  message.push(params.entryHash, i64LE(params.issuedAt));
  return Buffer.concat(message);
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
    const popSigner = anchor.web3.Keypair.generate();

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
    const [popConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pop-config"), authority.publicKey.toBuffer()],
      program.programId
    );
    const [popStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pop-state"), grantPda.toBuffer()],
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

    await program.methods
      .upsertPopConfig(popSigner.publicKey)
      .accounts({
        popConfig: popConfigPda,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
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

    const genesisHash = Buffer.alloc(32, 0);
    const auditHash = createHash("sha256").update(Buffer.from("audit-anchor:test")).digest();
    const issuedAt = BigInt(Math.floor(Date.now() / 1000));
    const entryHash = popEntryHash({
      version: POP_MESSAGE_VERSION_V2,
      prevHash: genesisHash,
      streamPrevHash: genesisHash,
      auditHash,
      grant: grantPda,
      claimer: claimer.publicKey,
      periodIndex: BigInt(periodIndex.toString()),
      issuedAt,
    });
    const popMessage = buildPopProofMessage({
      version: POP_MESSAGE_VERSION_V2,
      grant: grantPda,
      claimer: claimer.publicKey,
      periodIndex: BigInt(periodIndex.toString()),
      prevHash: genesisHash,
      streamPrevHash: genesisHash,
      auditHash,
      entryHash,
      issuedAt,
    });
    const popIx = Ed25519Program.createInstructionWithPrivateKey({
      privateKey: popSigner.secretKey,
      message: popMessage,
    });

    await program.methods
      .claimGrant(periodIndex)
      .accounts({
        grant: grantPda,
        mint,
        vault: vaultPda,
        claimer: claimer.publicKey,
        claimerAta: claimerAta.address,
        receipt: receiptPda,
        popState: popStatePda,
        popConfig: popConfigPda,
        instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      } as any)
      .preInstructions([popIx])
      .signers([claimer])
      .rpc();

    const after1 = await getAccount(provider.connection, claimerAta.address);
    assert.equal(after1.amount, BigInt(amountPerPeriod.toString()));

    // same period claim should fail (receipt already exists)
    const issuedAt2 = issuedAt + BigInt(1);
    const auditHash2 = createHash("sha256").update(Buffer.from("audit-anchor:test:2")).digest();
    const entryHash2 = popEntryHash({
      version: POP_MESSAGE_VERSION_V2,
      prevHash: entryHash,
      streamPrevHash: entryHash,
      auditHash: auditHash2,
      grant: grantPda,
      claimer: claimer.publicKey,
      periodIndex: BigInt(periodIndex.toString()),
      issuedAt: issuedAt2,
    });
    const popMessage2 = buildPopProofMessage({
      version: POP_MESSAGE_VERSION_V2,
      grant: grantPda,
      claimer: claimer.publicKey,
      periodIndex: BigInt(periodIndex.toString()),
      prevHash: entryHash,
      streamPrevHash: entryHash,
      auditHash: auditHash2,
      entryHash: entryHash2,
      issuedAt: issuedAt2,
    });
    const popIx2 = Ed25519Program.createInstructionWithPrivateKey({
      privateKey: popSigner.secretKey,
      message: popMessage2,
    });

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
          popState: popStatePda,
          popConfig: popConfigPda,
          instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        } as any)
        .preInstructions([popIx2])
        .signers([claimer])
        .rpc();
    } catch (_) {
      threw = true;
    }
    assert.equal(threw, true);
  });
});
