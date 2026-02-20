/**
 * ウォレット残高取得（SOL / SPL トークン）
 * 既存の getConnection() で取得した Connection を渡して使用する。
 */

import { Connection, PublicKey } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
  getMint,
} from "@solana/spl-token";

// --- changed ---
// Devnet: set this to a mint you actually care about (or leave TODO and rely on fallback elsewhere)
// NOTE: Some "real" mainnet mints may not exist on devnet.
// TODO: Replace with your devnet mint address if needed.
export const SPL_USDC_MINT = "TODO_DEVNET_MINT_ADDRESS";

export interface TokenBalanceItem {
  mint: string;
  amount: string;
  decimals: number;
  ata?: string;
}

/**
 * SOL 残高（lamports）を取得する。
 * 表示時は lamports / 1e9 で SOL に変換する。
 */
export async function getSolBalance(
  connection: Connection,
  owner: PublicKey
): Promise<number> {
  return connection.getBalance(owner);
}

/**
 * 所有者の SPL トークン残高一覧を取得する。
 * uiAmountString が "0" のものは除外する（表示対象は > 0 のみ）。
 */
export async function getTokenBalances(
  connection: Connection,
  owner: PublicKey
): Promise<TokenBalanceItem[]> {
  const programIds = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];
  const results = await Promise.all(
    programIds.map(async (programId) => {
      try {
        return await connection.getParsedTokenAccountsByOwner(owner, { programId });
      } catch {
        return { value: [] as Array<any> };
      }
    })
  );

  const out: TokenBalanceItem[] = [];
  const seenAta = new Set<string>();
  for (const res of results) {
    for (const { pubkey, account } of res.value) {
      const data = account.data as {
        parsed?: {
          info?: {
            mint?: string;
            tokenAmount?: {
              amount?: string;
              uiAmountString?: string;
              uiAmount?: number | null;
              decimals?: number;
            };
          };
        };
      } | undefined;

      const info = data?.parsed?.info;
      const tokenAmount = info?.tokenAmount;
      const mint = info?.mint;
      if (!tokenAmount || !mint) continue;

      let rawAmount = BigInt(0);
      try {
        rawAmount = BigInt(tokenAmount.amount ?? '0');
      } catch {
        rawAmount = BigInt(0);
      }
      if (rawAmount <= BigInt(0)) continue;

      const ata = pubkey.toBase58();
      if (seenAta.has(ata)) continue;
      seenAta.add(ata);

      const decimals = tokenAmount.decimals ?? 0;
      const parsedUi =
        tokenAmount.uiAmountString ??
        (typeof tokenAmount.uiAmount === 'number' ? String(tokenAmount.uiAmount) : '0');
      const amount = parsedUi !== '0'
        ? parsedUi
        : formatAmountForDisplay(rawAmount.toString(), decimals, Math.min(6, Math.max(decimals, 0)));

      out.push({
        mint,
        amount,
        decimals,
        ata,
      });
    }
  }

  return out;
}

/**
 * mint アドレスを短縮表示用にフォーマットする（例: ABCDE…WXYZ）
 */
export function formatMintShort(mint: string, head = 5, tail = 4): string {
  if (mint.length <= head + tail) return mint;
  return `${mint.slice(0, head)}…${mint.slice(-tail)}`;
}

export type FetchSplBalanceResult = {
  amount: string;   // raw amount as string
  decimals: number; // token decimals
};

export function formatAmountForDisplay(
  amount: string,
  decimals: number,
  fractionDigits: number = 2
): string {
  // Convert raw amount to UI amount with rounding
  // Use BigInt to avoid float overflow for large amounts
  try {
    const raw = BigInt(amount);
    const base = BigInt(10) ** BigInt(decimals);
    const whole = raw / base;
    const frac = raw % base;

    if (fractionDigits <= 0) return whole.toString();

    // scale fractional part to fractionDigits
    const scale = BigInt(10) ** BigInt(fractionDigits);
    const fracScaled = (frac * scale) / base;
    const fracStr = fracScaled.toString().padStart(fractionDigits, "0");
    return `${whole.toString()}.${fracStr}`;
  } catch {
    return "0";
  }
}

export async function fetchSplBalance(
  connection: Connection,
  ownerPubkey: PublicKey,
  mintPubkey: PublicKey
): Promise<FetchSplBalanceResult> {
  try {
    const mintInfo = await connection.getAccountInfo(mintPubkey, 'confirmed');
    const tokenProgramId =
      mintInfo?.owner?.toBase58() === TOKEN_2022_PROGRAM_ID.toBase58()
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;

    const ata = await getAssociatedTokenAddress(
      mintPubkey,
      ownerPubkey,
      false,
      tokenProgramId
    );
    const acc = await getAccount(connection, ata, 'confirmed', tokenProgramId);
    let decimals = 6;
    try {
      const mint = await getMint(connection, mintPubkey, 'confirmed', tokenProgramId);
      decimals = mint.decimals;
    } catch {
      // keep default
    }
    // acc.amount is bigint
    return { amount: acc.amount.toString(), decimals };
  } catch {
    // Fail-soft: no ATA / no balance / RPC issues => 0
    return { amount: "0", decimals: 6 };
  }
}

/** parsed.info.tokenAmount の型（getParsedTokenAccountsByOwner 用） */
interface ParsedTokenAmount {
  amount: string;
  decimals: number;
  uiAmount: number | null;
  uiAmountString: string;
}

/**
 * ウォレットが保有する SPL のうち uiAmount > 0 の最初の1件を返す。
 * TODO mint や指定 mint が 0 の場合のフォールバック用。
 * 失敗時は null（例外で落とさない）。
 */
export async function fetchAnyPositiveSplBalance(
  connection: Connection,
  ownerPubkey: PublicKey
): Promise<{ amountText: string; unit: string } | null> {
  try {
    const programIds = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];
    for (const programId of programIds) {
      const res = await connection.getParsedTokenAccountsByOwner(ownerPubkey, {
        programId,
      });
      for (const { account } of res.value) {
        const data = account.data as { parsed?: { info?: { tokenAmount?: ParsedTokenAmount } } } | undefined;
        const tokenAmount = data?.parsed?.info?.tokenAmount;
        if (!tokenAmount) continue;
        let rawAmount = BigInt(0);
        try {
          rawAmount = BigInt(tokenAmount.amount ?? '0');
        } catch {
          rawAmount = BigInt(0);
        }
        if (rawAmount <= BigInt(0)) continue;
        const amountText = formatAmountForDisplay(tokenAmount.amount, tokenAmount.decimals, 2);
        return { amountText, unit: "SPL" };
      }
    }
    return null;
  } catch {
    return null;
  }
}
