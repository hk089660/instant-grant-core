import { BN } from '@coral-xyz/anchor';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import {
  PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
  createCreateMetadataAccountV3Instruction,
} from '@metaplex-foundation/mpl-token-metadata';
import { getConnection, getProgram } from './anchorClient';
import { getGrantPda, getVaultPda } from './grantProgram';
import { signTransaction } from '../utils/phantom';
import { sendSignedTx } from './sendTx';
import { setPhantomWebReturnPath } from '../utils/phantomWebReturnPath';
import type { PhantomExtensionProvider } from '../wallet/phantomExtension';

const MAX_U64 = (BigInt(1) << BigInt(64)) - BigInt(1);
const MIN_PREFUND_MULTIPLIER = 100;

interface AdminPhantomMobileContext {
  mode: 'mobile';
  walletPubkey: string;
  phantomSession: string;
  dappEncryptionPublicKey: string;
  dappSecretKey: Uint8Array;
  phantomEncryptionPublicKey: string;
}

interface AdminPhantomExtensionContext {
  mode: 'extension';
  walletPubkey: string;
  extensionProvider: PhantomExtensionProvider;
}

export type AdminPhantomContext =
  | AdminPhantomMobileContext
  | AdminPhantomExtensionContext;

export interface IssueEventTicketTokenParams {
  phantom: AdminPhantomContext;
  eventTitle: string;
  ticketTokenAmount: number;
  claimIntervalDays: number;
  maxClaimsPerInterval: number | null;
}

export interface IssueEventTicketTokenResult {
  solanaMint: string;
  solanaAuthority: string;
  solanaGrantId: string;
  amountPerPeriod: string;
  bootstrapMintAmount: string;
  mintDecimals: number;
  setupSignatures: string[];
}

function buildSignRedirectContext(): { redirectLink: string; appUrl: string } {
  if (typeof window !== 'undefined' && window.location?.origin) {
    const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    setPhantomWebReturnPath(returnPath);
    return {
      redirectLink: `${window.location.origin}/phantom/signTransaction`,
      appUrl: window.location.origin,
    };
  }
  return {
    redirectLink: 'wene://phantom/sign?cluster=devnet',
    appUrl: 'https://wene.app',
  };
}

function toU64(value: bigint, name: string): bigint {
  if (value <= BigInt(0)) {
    throw new Error(`${name} must be greater than 0`);
  }
  if (value > MAX_U64) {
    throw new Error(`${name} exceeds u64 limit`);
  }
  return value;
}

function computeBootstrapAmount(
  amountPerPeriod: bigint,
  maxClaimsPerInterval: number | null
): bigint {
  const expectedClaimsPerInterval = maxClaimsPerInterval == null
    ? 100
    : Math.max(1, Math.floor(maxClaimsPerInterval));
  const expectedIntervals = maxClaimsPerInterval == null ? 30 : 60;
  const base = amountPerPeriod * BigInt(expectedClaimsPerInterval) * BigInt(expectedIntervals);
  const floor = amountPerPeriod * BigInt(MIN_PREFUND_MULTIPLIER);
  return base > floor ? base : floor;
}

function clipUtf8(input: string, maxBytes: number): string {
  if (maxBytes <= 0) return '';
  let out = '';
  let used = 0;
  for (const ch of input) {
    const bytes = new TextEncoder().encode(ch).length;
    if (used + bytes > maxBytes) break;
    out += ch;
    used += bytes;
  }
  return out;
}

async function signAndSendTx(
  tx: Transaction,
  phantom: AdminPhantomContext,
  extraSigners: Keypair[] = []
): Promise<string> {
  const connection = getConnection();
  const feePayer = new PublicKey(phantom.walletPubkey);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = feePayer;
  if (extraSigners.length > 0) {
    tx.partialSign(...extraSigners);
  }

  let signedTx: Transaction;
  if (phantom.mode === 'extension') {
    const provider = phantom.extensionProvider;
    if (!provider.isConnected) {
      await provider.connect();
    }
    signedTx = await provider.signTransaction(tx);
  } else {
    const { redirectLink, appUrl } = buildSignRedirectContext();
    signedTx = await signTransaction({
      tx,
      session: phantom.phantomSession,
      dappEncryptionPublicKey: phantom.dappEncryptionPublicKey,
      dappSecretKey: phantom.dappSecretKey,
      phantomEncryptionPublicKey: phantom.phantomEncryptionPublicKey,
      redirectLink,
      cluster: 'devnet',
      appUrl,
    });
  }
  return sendSignedTx(signedTx, { blockhash, lastValidBlockHeight });
}

export async function issueEventTicketToken(
  params: IssueEventTicketTokenParams
): Promise<IssueEventTicketTokenResult> {
  const amountPerPeriod = toU64(BigInt(Math.floor(params.ticketTokenAmount)), 'ticketTokenAmount');
  const bootstrapAmount = toU64(
    computeBootstrapAmount(amountPerPeriod, params.maxClaimsPerInterval),
    'bootstrapMintAmount'
  );

  const mintDecimals = 0;
  const claimIntervalDays = Math.max(1, Math.floor(params.claimIntervalDays));
  const periodSeconds = toU64(BigInt(claimIntervalDays * 24 * 60 * 60), 'periodSeconds');

  const authority = new PublicKey(params.phantom.walletPubkey);
  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;
  const grantId = BigInt(Date.now() * 1000 + Math.floor(Math.random() * 1000));
  const metadataName = clipUtf8(params.eventTitle.trim() || 'Event Ticket', 32);
  const metadataSymbol = clipUtf8((params.eventTitle || 'TICKET').replace(/\s+/g, '').slice(0, 10), 10) || 'TICKET';
  const metadataUri = clipUtf8(`https://instant-grant-core.pages.dev/metadata/${mint.toBase58()}.json`, 200);

  const ownerAta = getAssociatedTokenAddressSync(
    mint,
    authority,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const [grantPda] = getGrantPda(authority, mint, grantId);
  const [vaultPda] = getVaultPda(grantPda);
  const [metadataPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  const setupSignatures: string[] = [];

  // Tx1: 新規mint作成 + admin ATA作成 + 初期供給mint
  {
    const connection = getConnection();
    const rentForMint = await connection.getMinimumBalanceForRentExemption(MINT_SIZE, 'confirmed');
    const tx1 = new Transaction();
    tx1.add(
      SystemProgram.createAccount({
        fromPubkey: authority,
        newAccountPubkey: mint,
        lamports: rentForMint,
        space: MINT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        mint,
        mintDecimals,
        authority,
        authority,
        TOKEN_PROGRAM_ID
      ),
      createAssociatedTokenAccountInstruction(
        authority,
        ownerAta,
        authority,
        mint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      ),
      createMintToInstruction(
        mint,
        ownerAta,
        authority,
        bootstrapAmount,
        [],
        TOKEN_PROGRAM_ID
      )
    );
    setupSignatures.push(await signAndSendTx(tx1, params.phantom, [mintKeypair]));
  }

  // Tx2: Grant作成 + Vaultへ初期入金
  {
    const program = getProgram() as any;
    const nowTs = Math.floor(Date.now() / 1000);
    const startTs = Math.max(0, nowTs - 120);

    const createGrantIx = await program.methods
      .createGrant(
        new BN(grantId.toString()),
        new BN(amountPerPeriod.toString()),
        new BN(periodSeconds.toString()),
        new BN(startTs.toString()),
        new BN('0')
      )
      .accounts({
        grant: grantPda,
        mint,
        vault: vaultPda,
        authority,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .instruction();

    const metadataIx = createCreateMetadataAccountV3Instruction(
      {
        metadata: metadataPda,
        mint,
        mintAuthority: authority,
        payer: authority,
        updateAuthority: authority,
      },
      {
        createMetadataAccountArgsV3: {
          data: {
            name: metadataName,
            symbol: metadataSymbol,
            uri: metadataUri,
            sellerFeeBasisPoints: 0,
            creators: null,
            collection: null,
            uses: null,
          },
          isMutable: true,
          collectionDetails: null,
        },
      },
      TOKEN_METADATA_PROGRAM_ID
    );

    const fundGrantIx = await program.methods
      .fundGrant(new BN(bootstrapAmount.toString()))
      .accounts({
        grant: grantPda,
        mint,
        vault: vaultPda,
        fromAta: ownerAta,
        funder: authority,
        authority,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    const tx2 = new Transaction().add(createGrantIx, metadataIx, fundGrantIx);
    setupSignatures.push(await signAndSendTx(tx2, params.phantom));
  }

  return {
    solanaMint: mint.toBase58(),
    solanaAuthority: authority.toBase58(),
    solanaGrantId: grantId.toString(),
    amountPerPeriod: amountPerPeriod.toString(),
    bootstrapMintAmount: bootstrapAmount.toString(),
    mintDecimals,
    setupSignatures,
  };
}
