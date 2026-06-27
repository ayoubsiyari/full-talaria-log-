import { JOURNAL_API_BASE, syncJournalTokenFromSession } from "@/lib/journalApi";
import {
  defaultLiveJournalPropRules,
  flattenLiveJournalPropConfig,
  parseLiveJournalPropRules,
} from "@/lib/liveJournalPropRules";
import { authHeaders } from "@/app/dashboard/strategies/strategyLabV9Auth";
import type {
  ApiBrokerConnection,
  ApiJournalEntry,
  ApiJournalProfile,
  ApiLiveJournalAccount,
  V16AccountTypeKey,
  V16AppliedSource,
  V16JournalAccountInfo,
  V16JournalAccountRow,
  V16JournalBoot,
  V16LibraryConnection,
  V16StrategyGroup,
} from "./v16SourceTypes";

const BROKER_LABELS: Record<string, string> = {
  binance: "Binance",
  bybit: "Bybit",
  okx: "OKX",
  oanda: "OANDA",
  metatrader_5: "MetaTrader 5",
  mt5: "MetaTrader 5",
};

const INSTRUMENT_MARKET: Record<string, string> = {
  crypto: "Crypto",
  forex: "Forex",
  futures: "Futures",
  stocks: "Stocks",
  indices: "Indices",
  commodity: "Futures",
};

function isoDay(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function parseDurationMinutes(openTime?: string | null, closeTime?: string | null): number {
  if (!openTime || !closeTime) return 30;
  const a = new Date(openTime).getTime();
  const b = new Date(closeTime).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 30;
  return Math.max(1, Math.round((b - a) / 60000));
}

function instrumentMarket(instrumentType?: string): string {
  const key = String(instrumentType || "crypto").toLowerCase();
  return INSTRUMENT_MARKET[key] || "Crypto";
}

function brokerDisplayName(broker: string, label?: string): string {
  if (label?.trim()) return label.trim();
  const key = broker.toLowerCase().replace(/-/g, "_");
  return BROKER_LABELS[key] || broker.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function accountTypeKeyForProfile(profile: ApiJournalProfile | null): V16AccountTypeKey {
  return profile?.mode === "journal_live" ? "prop" : "personal";
}

function accountStatusLabel(accountTypeKey: V16AccountTypeKey, funded = false): string {
  if (accountTypeKey === "prop") return funded ? "Funded" : "Challenge";
  return "Live";
}

function tradeBrokerSource(entry: ApiJournalEntry): string {
  const extra = entry.extra_data;
  if (extra && typeof extra === "object") {
    const source = String(extra.source || extra.broker || "").toLowerCase();
    if (source) return source.split("_")[0];
  }
  return "";
}

function connectionMatchesTrade(conn: ApiBrokerConnection, entry: ApiJournalEntry): boolean {
  const source = tradeBrokerSource(entry);
  if (!source) return false;
  const broker = conn.broker.toLowerCase();
  return source === broker || source.startsWith(broker) || broker.startsWith(source);
}

function computePlannedRrFromEntry(
  entry: ApiJournalEntry,
  extra: Record<string, unknown>
): number | null {
  const fromExtra = Number(extra.planned_rr ?? extra.plannedRR);
  if (Number.isFinite(fromExtra) && fromExtra > 0) return fromExtra;
  const entryPrice = Number(entry.entry_price);
  const stop = Number(entry.stop_loss);
  const tp = Number(entry.take_profit);
  if (!Number.isFinite(entryPrice) || !Number.isFinite(stop) || !Number.isFinite(tp)) return null;
  const risk = Math.abs(entryPrice - stop);
  return risk > 0 ? Math.abs(tp - entryPrice) / risk : null;
}

export function mapLiveJournalEntryToV16Trade(
  entry: ApiJournalEntry,
  index: number,
  accountKey: string
): Record<string, unknown> {
  const sideRaw = String(entry.direction || "").toLowerCase();
  const side = sideRaw.includes("short") || sideRaw === "sell" ? "Short" : "Long";
  const isOpen = !entry.close_time && String(entry.trade_status || "").toLowerCase().includes("open");
  const pnl = isOpen ? 0 : Math.round(Number(entry.pnl) || 0);
  const r = Number(entry.rr);
  const rMultiple = isOpen ? 0 : Number.isFinite(r) ? r : 0;
  const market = instrumentMarket(entry.instrument_type);
  const tag = String(entry.setup || entry.strategy || "").trim() || "Journal";
  const date = isoDay(entry.close_time || entry.date || entry.open_time);
  const tradeId = `live-${entry.id}`;
  const extra = entry.extra_data;
  const extraObj = extra && typeof extra === "object" ? (extra as Record<string, unknown>) : {};
  const ttObj =
    extraObj.talaria_trade && typeof extraObj.talaria_trade === "object"
      ? (extraObj.talaria_trade as Record<string, unknown>)
      : {};
  const planAdherenceRaw = String(extraObj.planAdherence ?? ttObj.planAdherence ?? "").trim();
  const planReviewFromAdherence =
    planAdherenceRaw === "out-of-plan"
      ? "out_of_plan"
      : planAdherenceRaw === "missed-trade"
        ? "missed_trade"
        : planAdherenceRaw === "according-to-plan"
          ? "according_to_plan"
          : "";
  const plannedRR = computePlannedRrFromEntry(entry, extraObj);
  const planReviewKey =
    String(
      extraObj.plan_review ??
        extraObj.planReview ??
        ttObj.planReviewKey ??
        ttObj.planReview ??
        planReviewFromAdherence ??
        ""
    ).trim() || null;
  const rulesFollowed =
    typeof extraObj.rules_followed === "boolean"
      ? extraObj.rules_followed
      : typeof ttObj.rulesFollowed === "boolean"
        ? ttObj.rulesFollowed
        : planReviewKey === "according_to_plan"
          ? true
          : planReviewKey
            ? false
            : true;

  const entryPriceRaw = Number(entry.entry_price);
  const exitPriceRaw = Number(entry.exit_price);
  const stopRaw = entry.stop_loss != null ? Number(entry.stop_loss) : null;
  const tpRaw = entry.take_profit != null ? Number(entry.take_profit) : null;
  const qtyRaw = entry.quantity != null ? Number(entry.quantity) : null;
  const maeR = Number(extraObj.mae_r ?? extraObj.maeR);
  const mfeR = Number(extraObj.mfe_r ?? extraObj.mfeR);
  const entryPrice = Number.isFinite(entryPriceRaw) && entryPriceRaw > 0 ? entryPriceRaw : null;
  const exitPrice = Number.isFinite(exitPriceRaw) && exitPriceRaw > 0 ? exitPriceRaw : null;
  const stopLoss = stopRaw != null && Number.isFinite(stopRaw) && stopRaw > 0 ? stopRaw : null;
  const takeProfit = tpRaw != null && Number.isFinite(tpRaw) && tpRaw > 0 ? tpRaw : null;
  const quantity = qtyRaw != null && Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : null;
  const entries =
    Array.isArray(extraObj.entries) && extraObj.entries.length
      ? extraObj.entries
      : entryPrice != null
        ? [{ price: entryPrice, qty: quantity ?? 1 }]
        : undefined;
  const targets =
    Array.isArray(extraObj.targets) && extraObj.targets.length
      ? extraObj.targets
      : takeProfit != null
        ? [{ price: takeProfit, qty: quantity ?? 1 }]
        : undefined;
  const exits =
    Array.isArray(extraObj.exits) && extraObj.exits.length
      ? extraObj.exits
      : exitPrice != null
        ? [{ price: exitPrice, qty: quantity ?? 1 }]
        : undefined;

  return {
    id: tradeId,
    tradeId: entry.id,
    n: index + 1,
    date,
    closeTime: entry.close_time || entry.date || "",
    entryPrice,
    exitPrice,
    stopLoss,
    takeProfit,
    entryTime: entry.open_time || entry.date || "",
    openTime: entry.open_time || entry.date || "",
    quantity,
    symbol: String(entry.symbol || "—").toUpperCase(),
    market,
    side,
    session: "Journal",
    tag,
    reason: tag,
    rMultiple,
    duration: parseDurationMinutes(entry.open_time, entry.close_time),
    pnl,
    mae_r: Number.isFinite(maeR) ? maeR : isOpen ? 0 : -Math.abs(rMultiple) * 0.5,
    mfe_r: Number.isFinite(mfeR) ? mfeR : isOpen ? 0 : Math.abs(rMultiple) * 0.8,
    mae: Number.isFinite(maeR) ? -Math.abs(maeR) : isOpen ? 0 : -Math.abs(rMultiple) * 0.5,
    mfe: Number.isFinite(mfeR) ? Math.abs(mfeR) : isOpen ? 0 : Math.abs(rMultiple) * 0.8,
    highestPrice: entry.high_price ?? extraObj.highestPrice ?? null,
    lowestPrice: entry.low_price ?? extraObj.lowestPrice ?? null,
    entries,
    targets,
    exits,
    plannedRR: plannedRR ?? null,
    planned_rr: plannedRR ?? null,
    actualRR: isOpen ? null : Math.abs(rMultiple),
    status: isOpen ? "Open" : "Closed",
    rulesFollowed,
    planReview: planReviewKey,
    planReviewKey,
    plan_behavior: extraObj.plan_behavior ?? extraObj.planBehavior ?? null,
    missedTrade:
      planReviewKey === "missed_trade" ||
      extraObj.missed_trade === true ||
      ttObj.missedTrade === true,
    demons: Array.isArray(extraObj.demons)
      ? extraObj.demons
      : Array.isArray(ttObj.demons)
        ? ttObj.demons
        : [],
    demonCatcher: extraObj.demon_catcher ?? ttObj.demonCatcher ?? null,
    demon_category: extraObj.demon_category ?? ttObj.demon_category ?? ttObj.demonCategory ?? null,
    planAdherence: planAdherenceRaw || null,
    planOutcome: extraObj.plan_outcome ?? ttObj.planOutcome ?? null,
    postTradeNotes:
      ttObj.postTradeNotes && typeof ttObj.postTradeNotes === "object"
        ? ttObj.postTradeNotes
        : null,
    sl_modifications: Array.isArray(ttObj.sl_modifications) ? ttObj.sl_modifications : [],
    slModifications: Array.isArray(ttObj.sl_modifications) ? ttObj.sl_modifications : [],
    planned_risk_r: ttObj.planned_risk_r ?? null,
    actual_risk_r: ttObj.actual_risk_r ?? null,
    extra_data: extraObj,
    preTags: [tag],
    postTags: [pnl >= 0 ? "Win" : "Loss"],
    sourceKey: `journalAccount:${accountKey}`,
    sourceFilterKey: `journalAccount:${accountKey}`,
    sourceType: "journal",
    sourceDashboardKind: "journal",
    journalAccountKey: accountKey,
    strategyId: entry.strategy_id ?? null,
    strategyName: entry.strategy || "",
    notes: entry.notes ?? null,
    liveJournal: true,
    hasEditedTrade: Boolean(entry.updated_at && entry.created_at && entry.updated_at !== entry.created_at),
  };
}

function buildAccountInfo(
  key: string,
  accountNumber: string,
  connectionLabel: string,
  connectionId: string,
  accountIndex: number,
  accountTypeKey: V16AccountTypeKey,
  market: string,
  statusLabel?: string
): V16JournalAccountInfo {
  return {
    key,
    accountNumber,
    connection: connectionLabel,
    connectionId,
    accountIndex,
    type: statusLabel || accountStatusLabel(accountTypeKey),
    accountTypeKey,
    market,
  };
}

export function buildJournalBootFromApi(
  entries: ApiJournalEntry[],
  connections: ApiBrokerConnection[],
  activeProfile: ApiJournalProfile | null,
  liveAccounts: ApiLiveJournalAccount[] = []
): V16JournalBoot {
  const accountTypeKey = accountTypeKeyForProfile(activeProfile);
  const liveByProfileId = new Map<number, ApiLiveJournalAccount>();
  for (const live of liveAccounts) {
    liveByProfileId.set(live.profile_id, live);
  }
  const manualKey = "manual-journal";
  const manualConnectionId = "manual-journal";
  const defaultAccount = buildAccountInfo(
    manualKey,
    "Manual",
    "Manual Journal",
    manualConnectionId,
    0,
    accountTypeKey,
    "Mixed",
    accountStatusLabel(accountTypeKey)
  );

  const accountByKey: Record<string, V16JournalAccountInfo> = {
    [manualKey]: defaultAccount,
  };
  const tradeToAccountKey: Record<string, string> = {};
  const accountTradeBuckets = new Map<string, ApiJournalEntry[]>();
  const accountMeta = new Map<string, V16JournalAccountInfo>();

  for (const conn of connections) {
    const connId = `broker-${conn.id}`;
    const label = brokerDisplayName(conn.broker, conn.label);
    const market = conn.broker.toLowerCase().includes("oanda") ? "Forex" : "Crypto";
    const accountNumber =
      (conn as ApiBrokerConnection & { extra_config?: { account_id?: string } }).extra_config?.account_id ||
      String(conn.id);
    const info = buildAccountInfo(
      connId,
      accountNumber,
      label,
      connId,
      conn.id,
      accountTypeKey,
      market,
      accountStatusLabel(accountTypeKey, conn.status === "active" && conn.last_trade_count > 0)
    );
    accountByKey[connId] = info;
    accountMeta.set(connId, info);
    accountTradeBuckets.set(connId, []);
  }
  accountTradeBuckets.set(manualKey, []);

  const liveAccountKeys = new Map<number, string>();
  for (const live of liveAccounts) {
    const key = `live-account-${live.id}`;
    const connId = `live-${live.id}`;
    const typeKey: V16AccountTypeKey = live.account_type === "prop" ? "prop" : "personal";
    const info = buildAccountInfo(
      key,
      live.account_number,
      live.name || live.platform,
      connId,
      live.id,
      typeKey,
      live.market || "Forex",
      live.account_subtype || accountStatusLabel(typeKey)
    );
    accountByKey[key] = info;
    accountMeta.set(key, info);
    accountTradeBuckets.set(key, []);
    liveAccountKeys.set(live.profile_id, key);
  }

  for (const entry of entries) {
    const liveKey =
      entry.profile_id != null ? liveAccountKeys.get(Number(entry.profile_id)) : undefined;
    if (liveKey) {
      accountTradeBuckets.get(liveKey)!.push(entry);
      tradeToAccountKey[String(entry.id)] = liveKey;
      tradeToAccountKey[`live-${entry.id}`] = liveKey;
      continue;
    }

    let assignedKey = manualKey;
    for (const conn of connections) {
      const connId = `broker-${conn.id}`;
      if (connectionMatchesTrade(conn, entry)) {
        assignedKey = connId;
        break;
      }
    }

    const market = instrumentMarket(entry.instrument_type);
    const baseInfo = accountByKey[assignedKey] || defaultAccount;
    const marketKey = `${assignedKey}::${market}`;
    if (!accountByKey[marketKey]) {
      accountByKey[marketKey] = {
        ...baseInfo,
        key: marketKey,
        market,
      };
      accountTradeBuckets.set(marketKey, []);
    }
    accountTradeBuckets.get(marketKey)!.push(entry);
    tradeToAccountKey[String(entry.id)] = marketKey;
    tradeToAccountKey[`live-${entry.id}`] = marketKey;
  }

  const accounts: V16JournalAccountRow[] = [];
  const libraryTrades: Record<string, unknown>[] = [];
  const liveAccountKeySet = new Set(
    liveAccounts.map((live) => `live-account-${live.id}`)
  );

  for (const [key, bucket] of accountTradeBuckets.entries()) {
    if (!bucket.length && !liveAccountKeySet.has(key)) continue;
    const info = accountByKey[key] || defaultAccount;
    const liveMeta = liveAccounts.find((live) => `live-account-${live.id}` === key);
    const pnl = bucket.reduce((s, e) => s + (Number(e.pnl) || 0), 0);
    const strategyIds = [
      ...new Set(bucket.map((e) => e.strategy_id).filter((id): id is number => typeof id === "number" && id > 0)),
    ];
    const strategyNames = [
      ...new Set(bucket.map((e) => String(e.strategy || "").trim()).filter(Boolean)),
    ];
    const createdAt = bucket
      .map((e) => e.date || e.open_time || e.created_at)
      .filter(Boolean)
      .sort()[0] as string | undefined;

    accounts.push({
      id: key,
      name: liveMeta ? liveMeta.name : `${info.connection} / ${info.market}`,
      accountNumber: info.accountNumber,
      connection: liveMeta ? (liveMeta.prop_firm || "Manual Journal") : info.connection,
      connectionId: info.connectionId,
      accountIndex: info.accountIndex,
      type: liveMeta?.account_subtype || info.type,
      accountTypeKey: info.accountTypeKey,
      accountTypeLabel: info.accountTypeKey === "prop" ? "Prop" : "Personal",
      market: info.market,
      trades: bucket.length,
      pnl,
      pnlPct: liveMeta?.starting_balance
        ? pnl / Number(liveMeta.starting_balance) * 100
        : null,
      pnlPctTotal: 0,
      hasEditedTrades: bucket.some(
        (e) => e.updated_at && e.created_at && e.updated_at !== e.created_at
      ),
      createdAt: liveMeta?.created_at || createdAt || new Date().toISOString(),
      created: isoDay(liveMeta?.created_at || createdAt),
      lastSync: isoDay(
        bucket.map((e) => e.updated_at).filter(Boolean).sort().slice(-1)[0] ||
          liveMeta?.created_at
      ),
      totalTrades: bucket.length,
      primarySession: null,
      sessions: [],
      strategyIds,
      strategyNames,
      profileId: liveMeta?.profile_id,
      liveAccountId: liveMeta?.id,
      isLiveJournalAccount: Boolean(liveMeta),
      startingBalance: liveMeta?.starting_balance ?? null,
      currency: liveMeta?.currency || "USD",
      propFirm: liveMeta?.prop_firm ?? null,
      propRules: liveMeta?.prop_rules ?? null,
      propConfig: liveMeta
        ? flattenLiveJournalPropConfig(
            parseLiveJournalPropRules(liveMeta.prop_rules) ||
              (liveMeta.account_type === "prop"
                ? defaultLiveJournalPropRules(
                    liveMeta.market || "Forex",
                    Number(liveMeta.starting_balance) || 50000,
                    liveMeta.prop_firm || "FTMO"
                  )
                : null),
            Number(liveMeta.starting_balance) || 10000,
            liveMeta.market
          )
        : null,
      notes: liveMeta?.notes ?? null,
    });

    bucket.forEach((entry, i) => {
      libraryTrades.push(mapLiveJournalEntryToV16Trade(entry, i, key));
    });
  }

  const libraryConnections: V16LibraryConnection[] = connections.map((conn) => {
    const connId = `broker-${conn.id}`;
    const label = brokerDisplayName(conn.broker, conn.label);
    const rows = libraryTrades.filter((t) => tradeToAccountKey[String(t.tradeId)]?.startsWith(connId));
    return {
      id: connId,
      label,
      color: "#00d4a1",
      count: accounts.filter((a) => a.connectionId === connId).length || 1,
      entryCount: rows.length,
      accountTypeKey,
      match: (trade) => {
        const tid = String(trade?.tradeId ?? trade?.id ?? "").replace(/^live-/, "");
        const key = tradeToAccountKey[tid] || tradeToAccountKey[`live-${tid}`];
        return Boolean(key?.startsWith(connId));
      },
    };
  });

  for (const live of liveAccounts) {
    const connId = `live-${live.id}`;
    const typeKey: V16AccountTypeKey = live.account_type === "prop" ? "prop" : "personal";
    const rows = libraryTrades.filter((t) => {
      const key = tradeToAccountKey[String(t.tradeId)] || "";
      return key === `live-account-${live.id}`;
    });
    libraryConnections.push({
      id: connId,
      label: live.name || live.platform,
      color: typeKey === "prop" ? "#C9A84C" : "#00d4a1",
      count: 1,
      entryCount: rows.length,
      accountTypeKey: typeKey,
      custom: true,
      connection: {
        id: connId,
        name: live.name,
        platform: live.platform,
        account: live.account_number,
        accountType: live.account_subtype,
        market: live.market,
        profileId: live.profile_id,
        liveAccountId: live.id,
        createdAt: live.created_at,
        startingBalance: live.starting_balance,
        currency: live.currency,
        propFirm: live.prop_firm,
        notes: live.notes,
      },
      match: (trade) => {
        const tid = String(trade?.tradeId ?? trade?.id ?? "").replace(/^live-/, "");
        const key = tradeToAccountKey[tid] || tradeToAccountKey[`live-${tid}`];
        return key === `live-account-${live.id}`;
      },
    });
  }

  if (accounts.some((a) => a.id === manualKey || a.id.startsWith(`${manualKey}::`))) {
    const manualRows = libraryTrades.filter((t) => {
      const key = tradeToAccountKey[String(t.tradeId)] || "";
      return key === manualKey || key.startsWith(`${manualKey}::`);
    });
    libraryConnections.push({
      id: manualConnectionId,
      label: "Manual Journal",
      color: "#00d4a1",
      count: accounts.filter((a) => a.id === manualKey || a.id.startsWith(`${manualKey}::`)).length,
      entryCount: manualRows.length,
      accountTypeKey,
      match: (trade) => {
        const tid = String(trade?.tradeId ?? "").replace(/^live-/, "");
        const key = tradeToAccountKey[tid];
        return key === manualKey || Boolean(key?.startsWith(`${manualKey}::`));
      },
    });
  }

  const connectionOptions = [
    ...new Set([
      ...connections.map((c) => brokerDisplayName(c.broker, c.label)),
      ...liveAccounts.map((live) => live.name || live.platform),
      "Manual Journal",
    ]),
  ];

  accounts.sort((a, b) => b.trades - a.trades || a.name.localeCompare(b.name));

  return {
    libraryTrades,
    accounts,
    accountByKey,
    tradeToAccountKey,
    connections: libraryConnections,
    connectionOptions,
    defaultAccount,
  };
}

export function buildStrategyGroups(
  apiStrategies: { id: number; name: string; strategy_definition?: Record<string, unknown> | null }[],
  sessions: Record<string, unknown>[],
  journalAccounts: V16JournalAccountRow[]
): V16StrategyGroup[] {
  const slug = (name: string) =>
    String(name || "untitled")
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
      .replace(/^-|-$/g, "") || "untitled";

  const byName = new Map<string, V16StrategyGroup>();

  for (const s of apiStrategies) {
    const id = slug(s.name);
    byName.set(id, {
      id,
      label: s.name,
      color: "#4A6AFF",
      count: 0,
      sessionCount: 0,
      journalCount: 0,
      strategyApiId: s.id,
    });
  }

  for (const sess of sessions) {
    const name = String(sess.strategyName || "").trim();
    if (!name) continue;
    const id = slug(name);
    const cur = byName.get(id) || {
      id,
      label: name,
      color: "#4A6AFF",
      count: 0,
      sessionCount: 0,
      journalCount: 0,
    };
    cur.sessionCount += 1;
    cur.count += 1;
    byName.set(id, cur);
  }

  for (const account of journalAccounts) {
    for (const name of account.strategyNames) {
      const id = slug(name);
      const cur = byName.get(id) || {
        id,
        label: name,
        color: "#4A6AFF",
        count: 0,
        sessionCount: 0,
        journalCount: 0,
      };
      cur.journalCount += 1;
      cur.count += 1;
      byName.set(id, cur);
    }
    for (const sid of account.strategyIds) {
      const match = apiStrategies.find((s) => s.id === sid);
      if (!match) continue;
      const id = slug(match.name);
      const cur = byName.get(id);
      if (cur) {
        cur.journalCount += 1;
        cur.count += 1;
      }
    }
  }

  return [...byName.values()].sort((a, b) => b.sessionCount - a.sessionCount || a.label.localeCompare(b.label));
}

/** Merge a freshly saved journal entry into the embedded V16 boot (instant UI update). */
export function mergeLiveJournalTradeIntoBoot(
  source: { liveAccountId?: number | null; profileId?: number | null },
  entry: ApiJournalEntry
): void {
  if (typeof window === "undefined") return;
  const boot = window.__TALARIA_V16_BOOT__;
  if (!boot?.journal) return;

  const journal = boot.journal;
  const account = journal.accounts.find(
    (a) =>
      (source.liveAccountId != null && a.liveAccountId === source.liveAccountId) ||
      (source.profileId != null && a.profileId === source.profileId)
  );
  const accountKey =
    account?.id ??
    (source.liveAccountId != null ? `live-account-${source.liveAccountId}` : null);
  if (!accountKey) return;

  const entryId = String(entry.id);
  const existingIdx = journal.libraryTrades.findIndex(
    (t) => String(t.tradeId) === entryId || String(t.id) === `live-${entryId}`
  );
  const bucketSize = journal.libraryTrades.filter((t) => {
    const tid = String(t.tradeId ?? "").replace(/^live-/, "");
    const key = journal.tradeToAccountKey[tid] || journal.tradeToAccountKey[`live-${tid}`];
    return key === accountKey;
  }).length;
  const mapped = mapLiveJournalEntryToV16Trade(entry, existingIdx >= 0 ? existingIdx : bucketSize, accountKey);

  if (existingIdx >= 0) {
    journal.libraryTrades[existingIdx] = mapped;
  } else {
    journal.libraryTrades.push(mapped);
  }
  journal.tradeToAccountKey[entryId] = accountKey;
  journal.tradeToAccountKey[`live-${entryId}`] = accountKey;

  if (account) {
    const bucketTrades = journal.libraryTrades.filter((t) => {
      const tid = String(t.tradeId ?? "").replace(/^live-/, "");
      const key = journal.tradeToAccountKey[tid] || journal.tradeToAccountKey[`live-${tid}`];
      return key === accountKey;
    });
    account.trades = bucketTrades.length;
    account.totalTrades = bucketTrades.length;
    account.pnl = bucketTrades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
    if (account.startingBalance) {
      account.pnlPct = (account.pnl / Number(account.startingBalance)) * 100;
    }
    account.hasEditedTrades = bucketTrades.some((t) => Boolean(t.hasEditedTrade));
  }

  window.dispatchEvent(new CustomEvent("talaria-v16-boot-updated"));
}

export function buildAppliedSourceForSession(
  session: Record<string, unknown> | undefined
): V16AppliedSource | null {
  if (!session?.id) return null;
  return {
    kind: "session",
    id: session.id as string | number,
    sessionId: session.id as string | number,
    label: String(session.name || "Backtest"),
    rollbackAllowed: true,
  };
}

export async function fetchJournalApiData(): Promise<{
  entries: ApiJournalEntry[];
  connections: ApiBrokerConnection[];
  strategies: { id: number; name: string; strategy_definition?: Record<string, unknown> | null }[];
  activeProfile: ApiJournalProfile | null;
  liveAccounts: ApiLiveJournalAccount[];
}> {
  await syncJournalTokenFromSession();
  const headers = authHeaders();

  const [entriesRes, connectionsRes, strategiesRes, profilesRes, liveAccountsRes] = await Promise.all([
    fetch(`${JOURNAL_API_BASE}/journal/list`, { headers, cache: "no-store" }).catch(() => null),
    fetch(`${JOURNAL_API_BASE}/journal/broker/list`, { headers, cache: "no-store" }).catch(() => null),
    fetch(`${JOURNAL_API_BASE}/strategies`, { headers, cache: "no-store" }).catch(() => null),
    fetch(`${JOURNAL_API_BASE}/profile/profiles`, { headers, cache: "no-store" }).catch(() => null),
    fetch(`${JOURNAL_API_BASE}/journal/live-accounts`, { headers, cache: "no-store" }).catch(() => null),
  ]);

  let liveAccounts: ApiLiveJournalAccount[] = [];
  if (liveAccountsRes?.ok) {
    const data = (await liveAccountsRes.json()) as { accounts?: ApiLiveJournalAccount[] };
    liveAccounts = Array.isArray(data.accounts) ? data.accounts : [];
  }

  const entryById = new Map<number, ApiJournalEntry>();

  const mergeEntries = (rows: ApiJournalEntry[]) => {
    for (const row of rows) {
      if (typeof row.id === "number") entryById.set(row.id, row);
    }
  };

  if (entriesRes?.ok) {
    const data = (await entriesRes.json()) as ApiJournalEntry[] | { trades?: ApiJournalEntry[] };
    mergeEntries(Array.isArray(data) ? data : Array.isArray(data?.trades) ? data.trades : []);
  }

  const profileIds = [
    ...new Set(
      liveAccounts
        .map((a) => a.profile_id)
        .filter((id): id is number => typeof id === "number" && id > 0)
    ),
  ];
  await Promise.all(
    profileIds.map(async (profileId) => {
      const res = await fetch(
        `${JOURNAL_API_BASE}/journal/list?profile_id=${profileId}`,
        { headers, cache: "no-store" }
      ).catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json()) as ApiJournalEntry[] | { trades?: ApiJournalEntry[] };
      mergeEntries(Array.isArray(data) ? data : Array.isArray(data?.trades) ? data.trades : []);
    })
  );

  const entries = Array.from(entryById.values());

  let connections: ApiBrokerConnection[] = [];
  if (connectionsRes?.ok) {
    const data = (await connectionsRes.json()) as ApiBrokerConnection[];
    connections = Array.isArray(data) ? data : [];
  }

  let strategies: { id: number; name: string; strategy_definition?: Record<string, unknown> | null }[] = [];
  if (strategiesRes?.ok) {
    const data = (await strategiesRes.json()) as {
      strategies?: { id: number; name: string; strategy_definition?: Record<string, unknown> | null }[];
    };
    strategies = (data.strategies || [])
      .filter((s) => typeof s.id === "number" && s.name)
      .map((s) => ({
        id: s.id,
        name: String(s.name).trim(),
        strategy_definition:
          s.strategy_definition && typeof s.strategy_definition === "object"
            ? s.strategy_definition
            : null,
      }));
  }

  let activeProfile: ApiJournalProfile | null = null;
  if (profilesRes?.ok) {
    const data = (await profilesRes.json()) as {
      profiles?: ApiJournalProfile[];
    };
    const profiles = Array.isArray(data.profiles) ? data.profiles : [];
    activeProfile = profiles.find((p) => p.is_active) || profiles[0] || null;
  }

  return { entries, connections, strategies, activeProfile, liveAccounts };
}
