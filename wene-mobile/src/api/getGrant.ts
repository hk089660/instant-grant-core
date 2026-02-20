import type { Grant } from '../types/grant';
import { grantsByCampaignId } from '../data/grants';
import { getSchoolDeps } from '../api/createSchoolDeps';

/**
 * campaignId から Grant を取得する API
 * 現状はローカルマップを参照。見つからない場合は動的SchoolEventから変換
 */
export async function getGrantByCampaignId(campaignId: string): Promise<Grant | null> {
  const grant = grantsByCampaignId[campaignId];
  if (grant) {
    return { ...grant };
  }
  // Fallback to SchoolEvent
  try {
    const { eventProvider } = getSchoolDeps();
    const schoolEvent = await eventProvider.getById(campaignId);
    if (schoolEvent) {
      return {
        campaignId: schoolEvent.id,
        title: schoolEvent.title,
        description: `${schoolEvent.datetime} に開催されるイベントの参加券です`,
        issuerName: schoolEvent.host,
        solanaMint: schoolEvent.solanaMint,
        solanaAuthority: schoolEvent.solanaAuthority,
        solanaGrantId: schoolEvent.solanaGrantId,
        ticketTokenAmount: schoolEvent.ticketTokenAmount,
        balance: schoolEvent.ticketTokenAmount ?? 0,
        logoUrl: 'https://wene.app/images/grant-logo.png' // default dummy representation
      };
    }
  } catch (e) {
    console.warn('Failed to fetch dynamic school event for grant fallback', e);
  }

  return null;
}
