import type { AdminAuthSession } from './adminAuth';
import { getAdminScopeId } from './adminAuth';
import { useRecipientStore } from '../store/recipientStore';
import { useRecipientTicketStore } from '../store/recipientTicketStore';
import { usePhantomStore } from '../store/phantomStore';
import { clearUserClaimUsageCache } from '../utils/persistence';
import { clearParticipations } from '../data/participationStore';

let scopeSeq = 0;

function normalizeScopeId(scopeId?: string | null): string | null {
  const normalized = typeof scopeId === 'string' ? scopeId.trim().toLowerCase() : '';
  return normalized || null;
}

export function resolveAdminRuntimeScope(session: AdminAuthSession | null): string | null {
  if (!session) return null;
  return normalizeScopeId(getAdminScopeId(session));
}

export async function applyRuntimeScope(scopeId?: string | null): Promise<void> {
  const normalizedScope = normalizeScopeId(scopeId);
  const currentSeq = ++scopeSeq;

  const recipientStore = useRecipientStore.getState();
  const ticketStore = useRecipientTicketStore.getState();
  const phantomStore = usePhantomStore.getState();

  recipientStore.reset();
  recipientStore.setActiveUserId(normalizedScope);
  phantomStore.setActiveUser(normalizedScope);
  await ticketStore.setActiveUser(normalizedScope);
  if (scopeSeq !== currentSeq || !normalizedScope) return;

  await phantomStore.loadKeyPair();
  if (scopeSeq !== currentSeq) return;
  const saved = await phantomStore.loadPhantomConnectResult();
  if (scopeSeq !== currentSeq || !saved) return;

  phantomStore.setPhantomEncryptionPublicKey(saved.phantomPublicKey);
  await recipientStore.setWalletPubkey(saved.publicKey);
  recipientStore.setPhantomSession(saved.session);
  recipientStore.setState('Connected');
}

export async function applyAdminSessionRuntimeScope(session: AdminAuthSession | null): Promise<string | null> {
  const scopeId = resolveAdminRuntimeScope(session);
  await applyRuntimeScope(scopeId);
  return scopeId;
}

export async function clearAdminRuntimeArtifacts(session: AdminAuthSession | null): Promise<void> {
  const scopeId = resolveAdminRuntimeScope(session);
  if (!scopeId) return;

  const phantomStore = usePhantomStore.getState();
  const ticketStore = useRecipientTicketStore.getState();

  await ticketStore.clearUserTickets(scopeId);
  await clearUserClaimUsageCache(scopeId);
  await clearParticipations(scopeId);
  phantomStore.setActiveUser(scopeId);
  await phantomStore.clearPhantomKeys();
}
