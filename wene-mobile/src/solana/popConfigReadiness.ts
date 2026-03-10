import { PublicKey } from '@solana/web3.js';
import { GRANT_PROGRAM_ID } from './config';
import { getPopConfigPda } from './grantProgram';
import { getConnection } from './singleton';
import { resolveApiBaseUrl as resolveSharedApiBaseUrl } from '../api/resolveApiBaseUrl';

export type PopConfigReadinessReason =
  | 'ready'
  | 'missing'
  | 'owner_mismatch'
  | 'signer_mismatch'
  | 'invalid_authority'
  | 'rpc_error';

export interface PopConfigReadiness {
  ready: boolean;
  reason: PopConfigReadinessReason;
  popConfigPda: string | null;
  owner: string | null;
  configuredSignerPubkey: string | null;
  expectedSignerPubkey: string | null;
  expectedOwner: string;
}

interface FetchPopConfigReadinessOptions {
  expectedSignerPubkey?: string | null;
}

function resolveRuntimeApiBaseUrl(): string {
  return resolveSharedApiBaseUrl({ required: false });
}

export async function fetchExpectedPopSignerPubkeyFromRuntime(): Promise<string | null> {
  const base = resolveRuntimeApiBaseUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/v1/school/pop-status`, { method: 'GET' });
    if (!res.ok) return null;
    const body = (await res.json()) as { signerPubkey?: unknown };
    if (typeof body?.signerPubkey !== 'string') return null;
    const trimmed = body.signerPubkey.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

export async function fetchPopConfigReadiness(
  authorityBase58: string,
  options: FetchPopConfigReadinessOptions = {}
): Promise<PopConfigReadiness> {
  const authorityRaw = authorityBase58.trim();
  const expectedSignerPubkey =
    typeof options.expectedSignerPubkey === 'string' && options.expectedSignerPubkey.trim()
      ? options.expectedSignerPubkey.trim()
      : null;
  if (!authorityRaw) {
    return {
      ready: false,
      reason: 'invalid_authority',
      popConfigPda: null,
      owner: null,
      configuredSignerPubkey: null,
      expectedSignerPubkey,
      expectedOwner: GRANT_PROGRAM_ID.toBase58(),
    };
  }

  let authority: PublicKey;
  try {
    authority = new PublicKey(authorityRaw);
  } catch {
    return {
      ready: false,
      reason: 'invalid_authority',
      popConfigPda: null,
      owner: null,
      configuredSignerPubkey: null,
      expectedSignerPubkey,
      expectedOwner: GRANT_PROGRAM_ID.toBase58(),
    };
  }

  const [popConfigPda] = getPopConfigPda(authority);
  const expectedOwner = GRANT_PROGRAM_ID.toBase58();

  try {
    const accountInfo = await getConnection().getAccountInfo(popConfigPda, 'confirmed');
    if (!accountInfo) {
      return {
        ready: false,
        reason: 'missing',
        popConfigPda: popConfigPda.toBase58(),
        owner: null,
        configuredSignerPubkey: null,
        expectedSignerPubkey,
        expectedOwner,
      };
    }
    if (!accountInfo.owner.equals(GRANT_PROGRAM_ID)) {
      return {
        ready: false,
        reason: 'owner_mismatch',
        popConfigPda: popConfigPda.toBase58(),
        owner: accountInfo.owner.toBase58(),
        configuredSignerPubkey: null,
        expectedSignerPubkey,
        expectedOwner,
      };
    }
    let configuredSignerPubkey: string | null = null;
    if (accountInfo.data.length >= 72) {
      try {
        configuredSignerPubkey = new PublicKey(accountInfo.data.slice(40, 72)).toBase58();
      } catch {
        configuredSignerPubkey = null;
      }
    }
    if (
      expectedSignerPubkey &&
      configuredSignerPubkey &&
      configuredSignerPubkey !== expectedSignerPubkey
    ) {
      return {
        ready: false,
        reason: 'signer_mismatch',
        popConfigPda: popConfigPda.toBase58(),
        owner: accountInfo.owner.toBase58(),
        configuredSignerPubkey,
        expectedSignerPubkey,
        expectedOwner,
      };
    }
    return {
      ready: true,
      reason: 'ready',
      popConfigPda: popConfigPda.toBase58(),
      owner: accountInfo.owner.toBase58(),
      configuredSignerPubkey,
      expectedSignerPubkey,
      expectedOwner,
    };
  } catch {
    return {
      ready: false,
      reason: 'rpc_error',
      popConfigPda: popConfigPda.toBase58(),
      owner: null,
      configuredSignerPubkey: null,
      expectedSignerPubkey,
      expectedOwner,
    };
  }
}
