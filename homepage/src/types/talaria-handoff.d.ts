declare module "talaria-handoff/TalariaV16.jsx" {
  import type { ComponentType } from "react";
  const TalariaV16: ComponentType;
  export default TalariaV16;
}

declare module "talaria-handoff/v16AppliedSourceStorage.js" {
  export const V16_APPLIED_SOURCE_STORAGE_KEY: string;
  export function readPersistedAppliedSource(): Record<string, unknown> | null;
  export function writePersistedAppliedSource(source: Record<string, unknown> | null | undefined): void;
  export function validateAppliedSourceAgainstBoot(
    source: Record<string, unknown> | null | undefined,
    boot: {
      sessions?: { id?: string | number }[];
      journal?: { accounts?: { id?: string | number; isLiveJournalAccount?: boolean; liveAccountId?: number; profileId?: number; accountTypeKey?: string; name?: string }[] };
      strategies?: { id?: string; label?: string }[];
    }
  ): Record<string, unknown> | null;
  export function resolvePersistedAppliedSourceForBoot(boot: {
    sessions?: { id?: string | number }[];
    journal?: { accounts?: { id?: string | number; isLiveJournalAccount?: boolean; liveAccountId?: number; profileId?: number; accountTypeKey?: string; name?: string }[] };
    strategies?: { id?: string }[];
  }): Record<string, unknown> | null;
}
