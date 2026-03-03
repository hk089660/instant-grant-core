#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

const PROGRAM_ID = new PublicKey('GZcUoGHk8SfAArTKicL1jiRHZEQa3EuzgYcC2u4yWfSR');
const UPSERT_POP_CONFIG_DISCRIMINATOR = Buffer.from([103, 79, 37, 9, 166, 255, 209, 132]);
const POP_CONFIG_DISCRIMINATOR = Buffer.from([206, 210, 2, 223, 123, 112, 177, 181]);

const DEFAULT_WORKER_BASE_URL = 'https://instant-grant-core.haruki-kira3.workers.dev';
const DEFAULT_RPC_URL = 'https://api.devnet.solana.com';
const DEFAULT_TARGET_EVENT_STATES = 'published';

function expandHome(inputPath) {
  if (!inputPath) return inputPath;
  if (inputPath.startsWith('~/')) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

function loadKeypair(keypairPath) {
  const fullPath = expandHome(keypairPath);
  const raw = fs.readFileSync(fullPath, 'utf8');
  const secret = Uint8Array.from(JSON.parse(raw));
  return Keypair.fromSecretKey(secret);
}

function parseBooleanEnv(raw, fallback) {
  if (typeof raw !== 'string') return fallback;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return fallback;
}

function parseEventStates(raw) {
  const out = new Set();
  const source = typeof raw === 'string' ? raw : '';
  for (const part of source.split(',')) {
    const state = part.trim().toLowerCase();
    if (!state) continue;
    out.add(state);
  }
  return out;
}

function parseAuthorityKeypairMap() {
  const raw = (process.env.AUTHORITY_KEYPAIRS_JSON ?? '').trim();
  if (!raw) return new Map();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('AUTHORITY_KEYPAIRS_JSON must be valid JSON');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('AUTHORITY_KEYPAIRS_JSON must be an object');
  }
  const out = new Map();
  for (const [authority, keypairPath] of Object.entries(parsed)) {
    if (typeof authority !== 'string' || typeof keypairPath !== 'string') continue;
    const normalizedAuthority = authority.trim();
    const normalizedPath = keypairPath.trim();
    if (!normalizedAuthority || !normalizedPath) continue;
    out.set(normalizedAuthority, normalizedPath);
  }
  return out;
}

async function fetchJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    throw new Error(`${url} failed: ${res.status} ${res.statusText} ${text}`);
  }
  return body;
}

function buildUpsertPopConfigInstruction({ authority, signerPubkey }) {
  const [popConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('pop-config'), authority.toBuffer()],
    PROGRAM_ID
  );
  const data = Buffer.alloc(8 + 32);
  UPSERT_POP_CONFIG_DISCRIMINATOR.copy(data, 0);
  signerPubkey.toBuffer().copy(data, 8);
  return {
    popConfigPda,
    instruction: new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: popConfigPda, isSigner: false, isWritable: true },
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data,
    }),
  };
}

function parsePopConfigAccount(data) {
  if (!data || data.length < 73) return null;
  const discriminator = Buffer.from(data.slice(0, 8));
  if (!discriminator.equals(POP_CONFIG_DISCRIMINATOR)) return null;
  const authority = new PublicKey(data.slice(8, 40)).toBase58();
  const signerPubkey = new PublicKey(data.slice(40, 72)).toBase58();
  const bump = Number(data[72]);
  return { authority, signerPubkey, bump };
}

async function main() {
  const workerBase = (process.env.WORKER_BASE_URL ?? DEFAULT_WORKER_BASE_URL).trim().replace(/\/$/, '');
  const rpcUrl = (process.env.SOLANA_RPC_URL ?? DEFAULT_RPC_URL).trim();
  const dryRun = (process.env.DRY_RUN ?? '').trim().toLowerCase() === 'true';
  const strictMode = parseBooleanEnv(process.env.STRICT_MODE, true);
  const targetStates = parseEventStates(process.env.TARGET_EVENT_STATES ?? DEFAULT_TARGET_EVENT_STATES);
  const defaultKeypairPath = (process.env.DEFAULT_AUTHORITY_KEYPAIR ?? '~/.config/solana/id.json').trim();

  const popStatus = await fetchJson(`${workerBase}/v1/school/pop-status`);
  const signerPubkeyRaw = typeof popStatus?.signerPubkey === 'string' ? popStatus.signerPubkey.trim() : '';
  if (!signerPubkeyRaw) {
    throw new Error('signerPubkey is empty on /v1/school/pop-status');
  }
  const signerPubkey = new PublicKey(signerPubkeyRaw);

  const eventsBody = await fetchJson(`${workerBase}/v1/school/events`);
  const events = Array.isArray(eventsBody?.items) ? eventsBody.items : [];
  const authorityToEvents = new Map();
  for (const item of events) {
    const authority = typeof item?.solanaAuthority === 'string' ? item.solanaAuthority.trim() : '';
    const mint = typeof item?.solanaMint === 'string' ? item.solanaMint.trim() : '';
    const grantId = typeof item?.solanaGrantId === 'string' ? item.solanaGrantId.trim() : '';
    const state = typeof item?.state === 'string' ? item.state.trim().toLowerCase() : '';
    const eventId = typeof item?.id === 'string' ? item.id.trim() : '';
    if (!authority || !mint || !grantId || !eventId) continue;
    if (targetStates.size > 0 && !targetStates.has(state)) continue;

    const prev = authorityToEvents.get(authority) ?? [];
    prev.push({
      eventId,
      state,
      title: typeof item?.title === 'string' ? item.title.trim() : '',
    });
    authorityToEvents.set(authority, prev);
  }
  const authorities = Array.from(authorityToEvents.keys()).sort();

  const connection = new Connection(rpcUrl, 'confirmed');
  const defaultKeypair = loadKeypair(defaultKeypairPath);
  const defaultAuthority = defaultKeypair.publicKey.toBase58();
  const keypairMap = parseAuthorityKeypairMap();
  keypairMap.set(defaultAuthority, defaultKeypairPath);

  const results = [];

  for (const authorityRaw of authorities) {
    const linkedEvents = authorityToEvents.get(authorityRaw) ?? [];
    const eventIds = linkedEvents.map((event) => event.eventId);
    const authority = new PublicKey(authorityRaw);
    const keypairPath = keypairMap.get(authorityRaw);
    if (!keypairPath) {
      results.push({
        authority: authorityRaw,
        status: 'skipped_missing_keypair',
        eventIds,
      });
      continue;
    }

    const keypair = loadKeypair(keypairPath);
    const signerAuthority = keypair.publicKey.toBase58();
    if (signerAuthority !== authorityRaw) {
      results.push({
        authority: authorityRaw,
        status: 'skipped_keypair_mismatch',
        eventIds,
        detail: `signer=${signerAuthority} keypairPath=${expandHome(keypairPath)}`,
      });
      continue;
    }

    const { popConfigPda, instruction } = buildUpsertPopConfigInstruction({ authority, signerPubkey });
    const tx = new Transaction().add(instruction);

    if (dryRun) {
      results.push({
        authority: authorityRaw,
        status: 'dry_run',
        eventIds,
        popConfigPda: popConfigPda.toBase58(),
      });
      continue;
    }

    try {
      const signature = await sendAndConfirmTransaction(connection, tx, [keypair], {
        commitment: 'confirmed',
      });
      const accountInfo = await connection.getAccountInfo(popConfigPda, 'confirmed');
      const decoded = parsePopConfigAccount(accountInfo?.data ?? null);

      results.push({
        authority: authorityRaw,
        status: 'updated',
        eventIds,
        signature,
        popConfigPda: popConfigPda.toBase58(),
        onchainSignerPubkey: decoded?.signerPubkey ?? null,
      });
    } catch (err) {
      results.push({
        authority: authorityRaw,
        status: 'failed',
        eventIds,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const unresolved = results.filter(
    (r) => r.status === 'skipped_missing_keypair' || r.status === 'skipped_keypair_mismatch' || r.status === 'failed'
  );

  const summary = {
    workerBase,
    rpcUrl,
    targetSignerPubkey: signerPubkey.toBase58(),
    strictMode,
    targetEventStates: Array.from(targetStates),
    authoritiesTotal: authorities.length,
    updated: results.filter((r) => r.status === 'updated').length,
    dryRun: results.filter((r) => r.status === 'dry_run').length,
    skippedMissingKeypair: results.filter((r) => r.status === 'skipped_missing_keypair').length,
    skippedKeypairMismatch: results.filter((r) => r.status === 'skipped_keypair_mismatch').length,
    failed: results.filter((r) => r.status === 'failed').length,
    unresolvedCount: unresolved.length,
    results,
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (summary.failed > 0) {
    process.exit(2);
  }
  if (strictMode && summary.unresolvedCount > 0) {
    process.exit(3);
  }
}

main().catch((err) => {
  console.error('[upsert-pop-config-authorities] fatal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
