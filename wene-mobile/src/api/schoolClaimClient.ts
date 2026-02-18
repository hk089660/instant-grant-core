/**
 * 学校参加券 API クライアント
 *
 * インターフェースを定義し、実装は HTTP クライアントで提供。
 * UI の分岐は error.code のみに依存する。
 */

import type { SchoolClaimResult } from '../types/school';
import type { SchoolEvent } from '../types/school';

export interface SchoolClaimSubmitOptions {
  walletAddress?: string;
  joinToken?: string;
}

export interface SchoolClaimClient {
  submit(eventId: string, options?: SchoolClaimSubmitOptions): Promise<SchoolClaimResult>;
}

export interface SchoolEventProvider {
  getById(eventId: string): Promise<SchoolEvent | null>;
  getAll(): Promise<SchoolEvent[]>;
}
