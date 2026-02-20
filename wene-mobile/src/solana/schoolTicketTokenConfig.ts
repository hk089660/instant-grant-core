import type { SchoolEvent } from '../types/school';
import { DEVNET_GRANT_CONFIG } from './devnetConfig';

export interface SchoolTicketTokenConfig {
  solanaMint: string;
  solanaAuthority: string;
  solanaGrantId: string;
}

function parseEnvTokenConfig(): SchoolTicketTokenConfig | null {
  const mint = (process.env.EXPO_PUBLIC_SCHOOL_TICKET_MINT ?? '').trim();
  const authority = (process.env.EXPO_PUBLIC_SCHOOL_TICKET_AUTHORITY ?? '').trim();
  const grantId = (process.env.EXPO_PUBLIC_SCHOOL_TICKET_GRANT_ID ?? '').trim();

  if (!mint || !authority || !grantId) return null;

  return {
    solanaMint: mint,
    solanaAuthority: authority,
    solanaGrantId: grantId,
  };
}

export function getDefaultSchoolTicketTokenConfig(): SchoolTicketTokenConfig | null {
  const fromEnv = parseEnvTokenConfig();
  if (fromEnv) return fromEnv;

  if (!DEVNET_GRANT_CONFIG) return null;
  return {
    solanaMint: DEVNET_GRANT_CONFIG.mint.toBase58(),
    solanaAuthority: DEVNET_GRANT_CONFIG.authority.toBase58(),
    solanaGrantId: DEVNET_GRANT_CONFIG.grantId.toString(),
  };
}

export function resolveSchoolTicketTokenConfig(event: SchoolEvent | null | undefined): SchoolTicketTokenConfig | null {
  if (event?.solanaMint && event?.solanaAuthority && event?.solanaGrantId) {
    return {
      solanaMint: event.solanaMint,
      solanaAuthority: event.solanaAuthority,
      solanaGrantId: event.solanaGrantId,
    };
  }
  return getDefaultSchoolTicketTokenConfig();
}

