import type { Transaction } from '@solana/web3.js';

export interface PhantomExtensionProvider {
  isPhantom?: boolean;
  isConnected?: boolean;
  publicKey?: { toBase58?: () => string; toString: () => string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{
    publicKey?: { toBase58?: () => string; toString: () => string };
  }>;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
}

function toPubkeyString(
  value?: { toBase58?: () => string; toString: () => string } | null
): string | null {
  if (!value) return null;
  if (typeof value.toBase58 === 'function') return value.toBase58();
  const text = value.toString();
  return typeof text === 'string' && text.length > 0 ? text : null;
}

export function getPhantomExtensionProvider(): PhantomExtensionProvider | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  const provider = w?.phantom?.solana ?? w?.solana;
  if (!provider || provider.isPhantom !== true) return null;
  if (typeof provider.connect !== 'function' || typeof provider.signTransaction !== 'function') {
    return null;
  }
  return provider as PhantomExtensionProvider;
}

export function getPhantomExtensionPubkey(
  provider: PhantomExtensionProvider | null | undefined
): string | null {
  if (!provider) return null;
  return toPubkeyString(provider.publicKey);
}

