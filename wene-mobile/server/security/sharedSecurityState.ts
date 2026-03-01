export interface UserModerationState {
  frozen?: {
    frozenAt: number;
    reason: string;
    byActorId: string;
    reportId?: string;
  };
  deleted?: {
    deletedAt: number;
    reason: string;
    byActorId: string;
    reportId?: string;
  };
}

export interface SharedSecurityState {
  userModeration: Map<string, UserModerationState>;
}

export function createSharedSecurityState(): SharedSecurityState {
  return {
    userModeration: new Map<string, UserModerationState>(),
  };
}

