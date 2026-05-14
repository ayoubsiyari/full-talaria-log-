"use client";
import React, { useState, useEffect } from "react";

const TOC = [
  { id: "s1",  num: "1",  title: "Architecture Overview" },
  { id: "s2",  num: "2",  title: "Connection Methods" },
  { id: "s3",  num: "3",  title: "Supported Brokers & Platforms" },
  { id: "s4",  num: "4",  title: "Database Schema" },
  { id: "s5",  num: "5",  title: "Backend Pipeline" },
  { id: "s6",  num: "6",  title: "Phase 1 — Crypto Auto-Sync" },
  { id: "s7",  num: "7",  title: "Phase 2 — Forex (OANDA)" },
  { id: "s8",  num: "8",  title: "Phase 3 — MT4/MT5 EA Webhook" },
  { id: "s9",  num: "9",  title: "Phase 4 — OAuth Brokers" },
  { id: "s10", num: "10", title: "Phase 5 — Interactive Brokers" },
  { id: "s11", num: "11", title: "Phase 6 — TradingView Alerts" },
  { id: "s12", num: "12", title: "Trade Normalization Layer" },
  { id: "s13", num: "13", title: "Job Queue & Sync Scheduler" },
  { id: "s14", num: "14", title: "Security & Key Storage" },
  { id: "s15", num: "15", title: "Frontend — Connect Broker UI" },
  { id: "s16", num: "16", title: "Build Roadmap & Timeline" },
];

function Code({ lang, children }: { lang: string; children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="my-5 rounded-xl overflow-hidden border border-cyan-500/15">
      <div className="flex items-center justify-between px-4 py-2 bg-black/50 border-b border-cyan-500/10">
        <span className="text-xs font-mono text-cyan-400/60">{lang}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(children); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="text-xs text-cyan-400/40 hover:text-cyan-300 transition-colors px-2 py-0.5 rounded border border-transparent hover:border-cyan-500/20"
        >{copied ? "✓ Copied" : "Copy"}</button>
      </div>
      <pre className="overflow-x-auto p-5 text-sm font-mono leading-relaxed bg-[#040507] text-cyan-50/85 whitespace-pre">{children}</pre>
    </div>
  );
}

function Sec({ id, num, title, children }: { id: string; num: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-20 scroll-mt-6">
      <h2 className="flex items-center gap-3 text-2xl font-bold text-white mb-7 pb-4 border-b border-white/8">
        <span className="flex-shrink-0 w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-400 text-sm font-mono font-bold">{num}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold text-cyan-200 mt-8 mb-3">{children}</h3>;
}

function H4({ children }: { children: React.ReactNode }) {
  return <h4 className="text-base font-semibold text-cyan-300/80 mt-5 mb-2">{children}</h4>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-cyan-50/60 leading-relaxed mb-3 text-[15px]">{children}</p>;
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 px-4 py-3 rounded-lg bg-cyan-500/5 border-l-2 border-cyan-400/50 text-cyan-200/70 text-sm leading-relaxed">
      {children}
    </div>
  );
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 my-4">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-cyan-50/60">
          <span className="mt-0.5 w-4 h-4 flex-shrink-0 rounded border border-cyan-500/30 flex items-center justify-center text-cyan-500/50 text-[10px]">○</span>
          {item}
        </li>
      ))}
    </ul>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="my-5 overflow-x-auto rounded-xl border border-white/8">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/8 bg-white/3">
            {headers.map((h, i) => (
              <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-cyan-400/70 uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-white/5 hover:bg-white/2 transition-colors">
              {row.map((cell, ci) => (
                <td key={ci} className="px-4 py-3 text-cyan-50/60 whitespace-nowrap first:font-medium first:text-cyan-200/80">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BrokerIntegrationGuide() {
  const [active, setActive] = useState("s1");

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); }),
      { rootMargin: "-5% 0px -85% 0px" }
    );
    document.querySelectorAll("section[id]").forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, []);

  return (
    <div className="flex h-full overflow-hidden text-white" style={{ background: "#07080E" }}>

      {/* ── TOC sidebar ── */}
      <aside className="hidden xl:flex flex-col w-60 flex-shrink-0 border-r border-white/6 overflow-y-auto py-8 px-3">
        <p className="text-[10px] font-bold text-cyan-400/50 uppercase tracking-widest mb-4 px-2">Contents</p>
        <nav className="space-y-0.5">
          {TOC.map((t) => (
            <a key={t.id} href={`#${t.id}`}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[13px] transition-all duration-150 ${active === t.id ? "text-cyan-300 bg-cyan-500/10" : "text-white/30 hover:text-white/70 hover:bg-white/4"}`}>
              <span className="font-mono text-[10px] text-cyan-500/40 w-5 flex-shrink-0">{t.num}</span>
              <span className="leading-tight">{t.title}</span>
            </a>
          ))}
        </nav>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-10">

          {/* Page header */}
          <div className="mb-14">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-medium mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" /> Architecture Guide · May 2026
            </span>
            <h1 className="text-4xl font-extrabold text-white tracking-tight mb-3">Broker Integration Guide</h1>
            <p className="text-cyan-50/45 text-lg">Complete step-by-step plan to connect brokers and automate trade imports</p>
          </div>

          {/* ─────────────────────────── S1 ─────────────────────────── */}
          <Sec id="s1" num="1" title="Architecture Overview">
            <P>The system has 4 layers. The user connects once — after that, every trade appears in their journal automatically with no manual uploads or CSV exports.</P>
            <Code lang="text">{`LAYER 1 — BROKER SOURCES
  Binance, Bybit, OANDA, Alpaca, IBKR, MT4/MT5, TradingView, Prop firms

LAYER 2 — SYNC METHODS
  WebSocket (real-time) | REST polling (30–60s) | Webhook push | OAuth token

LAYER 3 — YOUR BACKEND PIPELINE
  Ingest → Normalize → Deduplicate → Enrich → Store → Push to UI

LAYER 4 — OUTPUT TO USER
  Live dashboard | Push notifications | Real-time journal | Risk alerts`}</Code>
          </Sec>

          {/* ─────────────────────────── S2 ─────────────────────────── */}
          <Sec id="s2" num="2" title="Connection Methods">
            <H3>2.1 WebSocket — True Real-Time (Best)</H3>
            <P>The broker pushes trade events the moment they execute. Your backend maintains a persistent connection per connected user.</P>
            <Code lang="text">{`1. User provides API key + secret on your platform
2. Your backend opens a WebSocket to the broker using those credentials
3. Broker pushes order fill events in real-time
4. You parse, normalize, and store the trade immediately

Brokers: Binance, Bybit, OKX, OANDA, Alpaca, Tradovate`}</Code>

            <H3>2.2 REST Polling — Near Real-Time</H3>
            <P>For brokers without WebSocket, your job queue polls their <code className="text-cyan-300 bg-cyan-500/10 px-1 rounded text-sm">/orders</code> endpoint every 30–60 seconds.</P>
            <Code lang="text">{`1. User provides API key + secret
2. A scheduled background job runs every N seconds per user
3. Fetch orders since the last sync timestamp
4. Deduplicate, then store new ones

Brokers: Interactive Brokers (TWS API), TD Ameritrade/Schwab, most prop firms`}</Code>

            <H3>2.3 MT4/MT5 EA Webhook — Reverse Push</H3>
            <P>MetaTrader has no public REST API. You provide a small Expert Advisor (EA) script that runs inside the user's MetaTrader and pushes each trade to your webhook.</P>

            <H3>2.4 OAuth 2.0 — Silent Token Refresh</H3>
            <P>Some brokers (Alpaca, Schwab) use OAuth. The user logs in through the broker's page once, and your backend silently renews tokens in the background forever.</P>
          </Sec>

          {/* ─────────────────────────── S3 ─────────────────────────── */}
          <Sec id="s3" num="3" title="Supported Brokers & Platforms">
            <Table
              headers={["Broker / Platform", "Method", "Difficulty", "Markets"]}
              rows={[
                ["Binance",               "WebSocket + REST",   "Easy",   "Crypto"],
                ["Bybit",                 "WebSocket + REST",   "Easy",   "Crypto"],
                ["OKX",                   "WebSocket + REST",   "Easy",   "Crypto"],
                ["OANDA",                 "WebSocket + REST",   "Easy",   "Forex"],
                ["Alpaca",                "OAuth + WebSocket",  "Easy",   "US Stocks"],
                ["MT4 / MT5",             "EA Webhook",         "Medium", "Forex, CFD"],
                ["TradingView",           "Alert Webhook",      "Easy",   "Any"],
                ["Interactive Brokers",   "REST (TWS/CPAPI)",   "Hard",   "All markets"],
                ["Tradovate",             "WebSocket",          "Medium", "Futures"],
                ["TD Ameritrade/Schwab",  "OAuth + REST",       "Medium", "US Stocks"],
                ["cTrader",               "REST + FIX",         "Medium", "Forex, CFD"],
                ["FTMO / prop firms",     "REST (varies)",      "Medium", "Forex, Futures"],
              ]}
            />
          </Sec>

          {/* ─────────────────────────── S4 ─────────────────────────── */}
          <Sec id="s4" num="4" title="Database Schema">
            <H3>4.1 broker_connections table</H3>
            <Code lang="sql">{`CREATE TABLE broker_connections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id),
  broker           VARCHAR(50)  NOT NULL,   -- 'binance', 'oanda', 'mt4', etc.
  auth_type        VARCHAR(20)  NOT NULL,   -- 'api_key', 'oauth', 'webhook'
  api_key_enc      TEXT,                    -- AES-256 encrypted
  api_secret_enc   TEXT,                    -- AES-256 encrypted
  access_token     TEXT,
  refresh_token    TEXT,
  token_expires_at TIMESTAMPTZ,
  webhook_secret   VARCHAR(64),
  last_synced_at   TIMESTAMPTZ,
  last_trade_id    VARCHAR(100),            -- cursor for incremental sync
  status           VARCHAR(20) DEFAULT 'active',
  error_message    TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);`}</Code>

            <H3>4.2 trades table</H3>
            <Code lang="sql">{`CREATE TABLE trades (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id),
  connection_id    UUID NOT NULL REFERENCES broker_connections(id),
  broker           VARCHAR(50)   NOT NULL,
  broker_trade_id  VARCHAR(150)  NOT NULL,
  symbol           VARCHAR(30)   NOT NULL,
  asset_class      VARCHAR(20),              -- forex|crypto|stock|futures|options
  side             VARCHAR(10)   NOT NULL,   -- 'buy' or 'sell'
  quantity         NUMERIC(20,8) NOT NULL,
  entry_price      NUMERIC(20,8) NOT NULL,
  exit_price       NUMERIC(20,8),
  stop_loss        NUMERIC(20,8),
  take_profit      NUMERIC(20,8),
  pnl              NUMERIC(20,8),
  pnl_pct          NUMERIC(10,4),
  fees             NUMERIC(20,8) DEFAULT 0,
  currency         VARCHAR(10)   DEFAULT 'USD',
  risk_reward      NUMERIC(10,4),
  open_time        TIMESTAMPTZ   NOT NULL,
  close_time       TIMESTAMPTZ,
  duration_seconds INTEGER,
  session          VARCHAR(20),              -- asia|london|new_york|overlap
  status           VARCHAR(20)   DEFAULT 'open',
  tags             TEXT[],
  notes            TEXT,
  raw_data         JSONB,
  created_at       TIMESTAMPTZ   DEFAULT NOW(),
  UNIQUE(user_id, broker, broker_trade_id)   -- deduplication key
);

CREATE INDEX idx_trades_user_id  ON trades(user_id);
CREATE INDEX idx_trades_open     ON trades(user_id, open_time DESC);
CREATE INDEX idx_trades_symbol   ON trades(user_id, symbol);`}</Code>
          </Sec>

          {/* ─────────────────────────── S5 ─────────────────────────── */}
          <Sec id="s5" num="5" title="Backend Pipeline">
            <P>Every incoming trade — regardless of source — goes through these 5 steps:</P>
            <Code lang="text">{`[Raw data from broker]
        ↓
   1. INGEST       — receive from WebSocket / REST poll / webhook
        ↓
   2. NORMALIZE    — map to your Trade schema
        ↓
   3. DEDUPLICATE  — check broker_trade_id, skip if already stored
        ↓
   4. ENRICH       — calculate P&L, R:R, session, duration
        ↓
   5. STORE + PUSH — save to DB, push to user via WebSocket`}</Code>

            <H3>5.1 Normalizer Interface</H3>
            <Code lang="typescript">{`interface NormalizedTrade {
  broker: string;
  broker_trade_id: string;
  symbol: string;
  asset_class: 'forex' | 'crypto' | 'stock' | 'futures' | 'options';
  side: 'buy' | 'sell';
  quantity: number;
  entry_price: number;
  exit_price?: number;
  stop_loss?: number;
  take_profit?: number;
  pnl?: number;
  fees?: number;
  currency: string;
  open_time: Date;
  close_time?: Date;
  status: 'open' | 'closed' | 'cancelled';
  raw_data: Record<string, any>;
}

interface BrokerNormalizer {
  broker: string;
  normalize(raw: Record<string, any>): NormalizedTrade;
}`}</Code>

            <H3>5.2 Enrichment Step</H3>
            <Code lang="typescript">{`function enrichTrade(trade: NormalizedTrade): NormalizedTrade {
  if (trade.close_time && trade.open_time)
    trade.duration_seconds = (trade.close_time.getTime() - trade.open_time.getTime()) / 1000;

  if (trade.stop_loss && trade.take_profit && trade.entry_price) {
    const risk   = Math.abs(trade.entry_price - trade.stop_loss);
    const reward = Math.abs(trade.take_profit  - trade.entry_price);
    trade.risk_reward = risk > 0 ? reward / risk : undefined;
  }

  const h = trade.open_time.getUTCHours();
  trade.session = h < 8 ? 'asia' : h < 13 ? 'london' : h < 17 ? 'overlap' : h < 22 ? 'new_york' : 'after_hours';

  return trade;
}`}</Code>
          </Sec>

          {/* ─────────────────────────── S6 ─────────────────────────── */}
          <Sec id="s6" num="6" title="Phase 1 — Crypto Auto-Sync">
            <H3>Binance WebSocket Integration</H3>
            <H4>Step 1 — Store credentials & open WebSocket</H4>
            <Code lang="typescript">{`async function startBinanceWebSocket(userId: string, apiKey: string) {
  // Get a listen key from Binance
  const { data } = await axios.post(
    'https://api.binance.com/api/v3/userDataStream',
    null,
    { headers: { 'X-MBX-APIKEY': apiKey } }
  );
  const listenKey = data.listenKey;

  // Keep listen key alive (ping every 25 minutes)
  setInterval(() =>
    axios.put(\`https://api.binance.com/api/v3/userDataStream?listenKey=\${listenKey}\`,
      null, { headers: { 'X-MBX-APIKEY': apiKey } }),
    25 * 60 * 1000
  );

  const ws = new WebSocket(\`wss://stream.binance.com:9443/ws/\${listenKey}\`);

  ws.on('message', async (data) => {
    const event = JSON.parse(data.toString());
    if (event.e === 'executionReport' && event.X === 'FILLED') {
      const normalized = normalizeBinanceTrade(event);
      await processTrade(userId, normalized);
    }
  });

  ws.on('close', () => setTimeout(() => startBinanceWebSocket(userId, apiKey), 5000));
}`}</Code>

            <H4>Step 2 — Binance trade normalizer</H4>
            <Code lang="typescript">{`function normalizeBinanceTrade(event: any): NormalizedTrade {
  return {
    broker:          'binance',
    broker_trade_id: String(event.t),
    symbol:          event.s,
    asset_class:     'crypto',
    side:            event.S.toLowerCase(),
    quantity:        parseFloat(event.q),
    entry_price:     parseFloat(event.p),
    fees:            parseFloat(event.n),
    currency:        event.N || 'USDT',
    open_time:       new Date(event.T),
    status:          'closed',
    raw_data:        event,
  };
}`}</Code>
            <Note>Bybit is nearly identical — use <code className="text-cyan-300">wss://stream.bybit.com/v5/private</code>, subscribe to the <code className="text-cyan-300">order</code> topic, and map <code className="text-cyan-300">execPrice / execQty</code>.</Note>
          </Sec>

          {/* ─────────────────────────── S7 ─────────────────────────── */}
          <Sec id="s7" num="7" title="Phase 2 — Forex Auto-Sync (OANDA)">
            <H4>Stream OANDA transactions in real-time</H4>
            <Code lang="typescript">{`async function streamOandaTransactions(userId: string, apiKey: string, accountId: string) {
  const options = {
    hostname: 'stream-fxtrade.oanda.com',
    path: \`/v3/accounts/\${accountId}/transactions/stream\`,
    headers: { Authorization: \`Bearer \${apiKey}\` },
  };

  https.request(options, (res) => {
    let buffer = '';
    res.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === 'ORDER_FILL')
            processTrade(userId, normalizeOandaTrade(event));
        } catch {}
      }
    });
    res.on('end', () =>
      setTimeout(() => streamOandaTransactions(userId, apiKey, accountId), 3000)
    );
  }).end();
}

function normalizeOandaTrade(event: any): NormalizedTrade {
  const units = parseFloat(event.units);
  return {
    broker:          'oanda',
    broker_trade_id: String(event.id),
    symbol:          event.instrument.replace('_', ''),  // EUR_USD → EURUSD
    asset_class:     'forex',
    side:            units > 0 ? 'buy' : 'sell',
    quantity:        Math.abs(units),
    entry_price:     parseFloat(event.price),
    pnl:             parseFloat(event.pl || '0'),
    fees:            parseFloat(event.commission || '0'),
    currency:        event.accountCurrency,
    open_time:       new Date(event.time),
    status:          'closed',
    raw_data:        event,
  };
}`}</Code>
          </Sec>

          {/* ─────────────────────────── S8 ─────────────────────────── */}
          <Sec id="s8" num="8" title="Phase 3 — MT4/MT5 EA Webhook">
            <H3>8.1 Backend webhook receiver</H3>
            <Code lang="typescript">{`// POST /api/webhooks/mt4/:userId/:secret
app.post('/api/webhooks/mt4/:userId/:secret', async (req, res) => {
  const { userId, secret } = req.params;
  const connection = await db.brokerConnections.findOne({
    user_id: userId, broker: 'mt4', webhook_secret: secret,
  });
  if (!connection) return res.status(401).json({ error: 'Invalid webhook secret' });

  for (const trade of req.body.trades)
    await processTrade(userId, normalizeMT4Trade(trade));

  res.json({ received: req.body.trades.length });
});`}</Code>

            <H3>8.2 MT4 Expert Advisor (MQL4)</H3>
            <P>Provide this <code className="text-cyan-300 bg-cyan-500/10 px-1 rounded text-sm">.mq4</code> file to users — they compile it in MetaEditor and attach it to any chart.</P>
            <Code lang="mql4">{`#property strict
input string WebhookURL    = "https://yourplatform.com/api/webhooks/mt4";
input string UserId        = "";
input string WebhookSecret = "";

int lastTradeCount = 0;

int OnInit() {
  lastTradeCount = OrdersHistoryTotal();
  return INIT_SUCCEEDED;
}

void OnTrade() {
  int currentCount = OrdersHistoryTotal();
  if (currentCount <= lastTradeCount) return;
  if (OrderSelect(currentCount - 1, SELECT_BY_POS, MODE_HISTORY))
    SendWebhook(BuildPayload());
  lastTradeCount = currentCount;
}

string BuildPayload() {
  return StringFormat(
    "{\\"trades\\":[{"
      "\\"ticket\\":%d,\\"symbol\\":\\"%s\\",\\"type\\":%d,\\"lots\\":%.2f,"
      "\\"open_price\\":%.5f,\\"close_price\\":%.5f,"
      "\\"open_time\\":\\"%s\\",\\"close_time\\":\\"%s\\","
      "\\"profit\\":%.2f,\\"commission\\":%.2f,\\"swap\\":%.2f,"
      "\\"stop_loss\\":%.5f,\\"take_profit\\":%.5f"
    "}]}",
    OrderTicket(), OrderSymbol(), OrderType(), OrderLots(),
    OrderOpenPrice(), OrderClosePrice(),
    TimeToStr(OrderOpenTime()), TimeToStr(OrderCloseTime()),
    OrderProfit(), OrderCommission(), OrderSwap(),
    OrderStopLoss(), OrderTakeProfit()
  );
}

void SendWebhook(string payload) {
  string headers = "Content-Type: application/json\\r\\n";
  string url = WebhookURL + "/" + UserId + "/" + WebhookSecret;
  char post[], result[];
  StringToCharArray(payload, post, 0, StringLen(payload));
  WebRequest("POST", url, headers, 5000, post, result, headers);
}`}</Code>

            <H3>8.3 MT4 normalizer</H3>
            <Code lang="typescript">{`function normalizeMT4Trade(event: any): NormalizedTrade {
  return {
    broker: 'mt4', broker_trade_id: String(event.ticket),
    symbol: event.symbol, asset_class: 'forex',
    side: event.type === 0 ? 'buy' : 'sell',
    quantity: event.lots,
    entry_price:  event.open_price,
    exit_price:   event.close_price,
    stop_loss:    event.stop_loss  || undefined,
    take_profit:  event.take_profit || undefined,
    pnl:   event.profit + event.commission + event.swap,
    fees:  event.commission + event.swap,
    currency: 'USD',
    open_time:  new Date(event.open_time),
    close_time: new Date(event.close_time),
    status: 'closed', raw_data: event,
  };
}`}</Code>
          </Sec>

          {/* ─────────────────────────── S9 ─────────────────────────── */}
          <Sec id="s9" num="9" title="Phase 4 — OAuth Brokers (Alpaca, Schwab/TD)">
            <Code lang="typescript">{`// Step 1 — Redirect to Alpaca
app.get('/api/brokers/alpaca/connect', (req, res) => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.ALPACA_CLIENT_ID!,
    redirect_uri:  process.env.ALPACA_REDIRECT_URI!,
    scope:         'account:write trading',
  });
  res.redirect(\`https://app.alpaca.markets/oauth/authorize?\${params}\`);
});

// Step 2 — Handle callback + store tokens
app.get('/api/brokers/alpaca/callback', async (req, res) => {
  const userId = decodeStateToken(req.query.state as string);
  const { data } = await axios.post('https://api.alpaca.markets/oauth/token', {
    grant_type: 'authorization_code', code: req.query.code,
    client_id: process.env.ALPACA_CLIENT_ID,
    client_secret: process.env.ALPACA_CLIENT_SECRET,
    redirect_uri: process.env.ALPACA_REDIRECT_URI,
  });
  await db.brokerConnections.create({
    user_id: userId, broker: 'alpaca', auth_type: 'oauth',
    access_token: encrypt(data.access_token),
    refresh_token: encrypt(data.refresh_token),
    token_expires_at: new Date(Date.now() + data.expires_in * 1000),
    status: 'active',
  });
  startAlpacaWebSocket(userId, data.access_token);
  res.redirect('/dashboard?connected=alpaca');
});

// Step 3 — Silent token refresh (run hourly)
async function refreshExpiredTokens() {
  const expiringSoon = await db.brokerConnections.findAll({
    where: { auth_type: 'oauth', status: 'active',
             token_expires_at: { $lt: new Date(Date.now() + 5 * 60_000) } }
  });
  for (const conn of expiringSoon) {
    try {
      const { data } = await axios.post('https://api.alpaca.markets/oauth/token', {
        grant_type: 'refresh_token',
        refresh_token: decrypt(conn.refresh_token),
        client_id: process.env.ALPACA_CLIENT_ID,
        client_secret: process.env.ALPACA_CLIENT_SECRET,
      });
      await conn.update({ access_token: encrypt(data.access_token),
        token_expires_at: new Date(Date.now() + data.expires_in * 1000) });
    } catch {
      await conn.update({ status: 'error', error_message: 'Token refresh failed' });
    }
  }
}`}</Code>
          </Sec>

          {/* ─────────────────────────── S10 ─────────────────────────── */}
          <Sec id="s10" num="10" title="Phase 5 — Interactive Brokers (IBKR)">
            <P>IBKR uses their Client Portal API (REST) which requires the Client Portal Gateway running locally or server-side.</P>
            <Code lang="typescript">{`async function pollIBKRTrades(userId: string, gatewayUrl: string) {
  const since = await getLastSyncTime(userId, 'ibkr');
  const { data } = await axios.get(\`\${gatewayUrl}/v1/api/iserver/account/trades\`, {
    httpsAgent: new https.Agent({ rejectUnauthorized: false }), // IBKR self-signed cert
  });
  for (const trade of data.filter((t: any) => new Date(t.trade_time) > since))
    await processTrade(userId, normalizeIBKRTrade(trade));
  await updateLastSyncTime(userId, 'ibkr');
}

function normalizeIBKRTrade(event: any): NormalizedTrade {
  const assetMap: Record<string,string> = { STK: 'stock', FUT: 'futures', OPT: 'options', CASH: 'forex' };
  return {
    broker: 'ibkr', broker_trade_id: event.execution_id,
    symbol: event.symbol,
    asset_class: assetMap[event.sec_type] || 'stock',
    side: event.side.toLowerCase(), quantity: Math.abs(event.size),
    entry_price: event.price, pnl: event.realized_pnl || 0,
    fees: event.commission || 0, currency: event.currency,
    open_time: new Date(event.trade_time), status: 'closed', raw_data: event,
  };
}`}</Code>
          </Sec>

          {/* ─────────────────────────── S11 ─────────────────────────── */}
          <Sec id="s11" num="11" title="Phase 6 — TradingView Alerts Webhook">
            <H4>Alert JSON format (users paste this into their TradingView alert)</H4>
            <Code lang="json">{`{
  "action":    "{{strategy.order.action}}",
  "symbol":    "{{ticker}}",
  "price":     {{strategy.order.price}},
  "quantity":  {{strategy.position_size}},
  "pnl":       {{strategy.netprofit}},
  "timestamp": "{{timenow}}"
}`}</Code>

            <H4>Webhook receiver + normalizer</H4>
            <Code lang="typescript">{`app.post('/api/webhooks/tradingview/:userId/:secret', async (req, res) => {
  const { userId, secret } = req.params;
  const connection = await verifyWebhookSecret(userId, secret, 'tradingview');
  if (!connection) return res.status(401).send('Unauthorized');
  await processTrade(userId, normalizeTradingViewAlert(req.body));
  res.json({ ok: true });
});

function normalizeTradingViewAlert(body: any): NormalizedTrade {
  return {
    broker: 'tradingview',
    broker_trade_id: \`\${body.symbol}_\${body.timestamp}\`,
    symbol: body.symbol,
    asset_class: detectAssetClass(body.symbol),
    side: body.action.toLowerCase(),
    quantity: body.quantity || 1,
    entry_price: parseFloat(body.price),
    pnl: parseFloat(body.pnl || '0'),
    fees: 0, currency: 'USD',
    open_time: new Date(body.timestamp),
    status: 'closed', raw_data: body,
  };
}`}</Code>
          </Sec>

          {/* ─────────────────────────── S12 ─────────────────────────── */}
          <Sec id="s12" num="12" title="Trade Normalization Layer">
            <P>The central <code className="text-cyan-300 bg-cyan-500/10 px-1 rounded text-sm">processTrade</code> function — every sync method calls this:</P>
            <Code lang="typescript">{`async function processTrade(userId: string, normalized: NormalizedTrade) {
  // 1. Deduplicate
  const existing = await db.trades.findOne({
    user_id: userId, broker: normalized.broker, broker_trade_id: normalized.broker_trade_id,
  });
  if (existing) return;

  // 2. Enrich
  const enriched = enrichTrade(normalized);

  // 3. Store
  const trade = await db.trades.create({ user_id: userId, ...enriched });

  // 4. Push to user's browser via WebSocket
  wsServer.sendToUser(userId, { type: 'NEW_TRADE', trade });

  // 5. Check risk rules
  await checkRiskAlerts(userId, trade);
}`}</Code>
          </Sec>

          {/* ─────────────────────────── S13 ─────────────────────────── */}
          <Sec id="s13" num="13" title="Job Queue & Sync Scheduler">
            <P>Use <strong className="text-white">BullMQ</strong> (Node.js) with Redis to manage all sync jobs. Each broker connection gets its own repeating job.</P>
            <Code lang="typescript">{`import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

const redis     = new Redis(process.env.REDIS_URL);
const syncQueue = new Queue('broker-sync', { connection: redis });

async function scheduleSyncJobs() {
  const connections = await db.brokerConnections.findAll({ where: { status: 'active' } });
  for (const conn of connections) {
    await syncQueue.add(
      \`sync-\${conn.broker}\`,
      { connectionId: conn.id, userId: conn.user_id, broker: conn.broker },
      {
        repeat:           { every: 30_000 },
        jobId:            \`sync-\${conn.id}\`,   // unique per connection = no duplicates
        removeOnComplete: 10,
        removeOnFail:     50,
      }
    );
  }
}

const worker = new Worker('broker-sync', async (job) => {
  const { connectionId, userId, broker } = job.data;
  const conn = await db.brokerConnections.findById(connectionId);
  switch (broker) {
    case 'ibkr':  return pollIBKRTrades(userId, conn.gateway_url);
    case 'oanda': return pollOANDATrades(userId, conn);
    default:      break; // WebSocket/webhook brokers don't need polling
  }
}, { connection: redis, concurrency: 20 });

worker.on('failed', async (job, err) => {
  if (job && job.attemptsMade >= 5) {
    await db.brokerConnections.update(
      { status: 'error', error_message: err.message },
      { where: { id: job.data.connectionId } }
    );
    notifyUser(job.data.userId, \`Connection to \${job.data.broker} has an error. Please reconnect.\`);
  }
});`}</Code>
          </Sec>

          {/* ─────────────────────────── S14 ─────────────────────────── */}
          <Sec id="s14" num="14" title="Security & Key Storage">
            <H3>AES-256-GCM encryption utility</H3>
            <Code lang="typescript">{`import crypto from 'crypto';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'); // 32 bytes

export function encrypt(text: string): string {
  const iv        = crypto.randomBytes(12);
  const cipher    = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag       = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decrypt(encoded: string): string {
  const buf       = Buffer.from(encoded, 'base64');
  const iv        = buf.subarray(0, 12);
  const tag       = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher  = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
}`}</Code>
            <H3>Security checklist</H3>
            <CheckList items={[
              "API keys encrypted at rest with AES-256-GCM",
              "Encryption key stored in environment variable, never in code",
              "Webhook secrets are 32+ character random strings (not guessable)",
              "All broker connections scoped to read-only trade history (never withdrawal permissions)",
              "Rate limit webhook endpoints — max 100 req/min per user",
              "HTTPS only — no plain HTTP connections to brokers",
              "Log all sync activity but never log raw API keys",
              "Allow users to revoke/disconnect any broker at any time",
            ]} />
          </Sec>

          {/* ─────────────────────────── S15 ─────────────────────────── */}
          <Sec id="s15" num="15" title="Frontend — Connect Broker UI">
            <Code lang="typescript">{`const brokers = [
  { id: 'binance', name: 'Binance', method: 'api_key', markets: 'Crypto'     },
  { id: 'bybit',   name: 'Bybit',   method: 'api_key', markets: 'Crypto'     },
  { id: 'oanda',   name: 'OANDA',   method: 'api_key', markets: 'Forex'      },
  { id: 'alpaca',  name: 'Alpaca',  method: 'oauth',   markets: 'US Stocks'  },
  { id: 'mt4',     name: 'MT4/MT5', method: 'ea',      markets: 'Forex/CFD'  },
  { id: 'ibkr',    name: 'IBKR',    method: 'api_key', markets: 'All'        },
];

function BrokerCard({ broker }) {
  const connect = () => {
    if (broker.method === 'oauth')   window.location.href = \`/api/brokers/\${broker.id}/connect\`;
    else if (broker.method === 'api_key') openApiKeyModal(broker);
    else if (broker.method === 'ea')      openEAGuide(broker);
  };
  return (
    <div className="broker-card">
      <h3>{broker.name}</h3>
      <span>{broker.markets}</span>
      <span>Auto-sync ✓</span>
      <button onClick={connect}>Connect</button>
    </div>
  );
}

function ConnectionStatus({ connection }) {
  return (
    <div>
      <span className={\`dot \${connection.status}\`} />
      <span>{connection.broker}</span>
      <span>Last sync: {formatRelativeTime(connection.last_synced_at)}</span>
      {connection.status === 'error' && <span>{connection.error_message}</span>}
      <button onClick={() => reconnect(connection.id)}>
        {connection.status === 'error' ? 'Reconnect' : 'Disconnect'}
      </button>
    </div>
  );
}`}</Code>
          </Sec>

          {/* ─────────────────────────── S16 ─────────────────────────── */}
          <Sec id="s16" num="16" title="Build Roadmap & Timeline">
            <H3>Phase 1 — Foundation (Weeks 1–4)</H3>
            <CheckList items={[
              "broker_connections and trades database tables",
              "Encrypt/decrypt utility for API keys",
              "Core processTrade pipeline (ingest → normalize → deduplicate → enrich → store)",
              "BullMQ job queue setup with Redis",
              "Binance WebSocket integration (real-time crypto trades)",
              "Bybit WebSocket integration",
              "Frontend: broker connect page (API key modal)",
              "Frontend: connection status card",
            ]} />
            <H3>Phase 2 — Forex (Weeks 5–7)</H3>
            <CheckList items={[
              "OANDA REST + streaming integration",
              "MT4/MT5 EA webhook receiver endpoint",
              "MQL4/MQL5 EA source file + user setup guide",
              "Generate unique webhook URL + secret per user",
              "Frontend: EA download + installation guide modal",
            ]} />
            <H3>Phase 3 — Stocks & OAuth (Weeks 8–10)</H3>
            <CheckList items={[
              "Alpaca OAuth 2.0 flow + WebSocket",
              "Silent OAuth token refresh background job",
              "TD Ameritrade / Schwab OAuth + REST polling",
              "User notification system (email + in-app) for sync errors",
            ]} />
            <H3>Phase 4 — Advanced (Weeks 11–14)</H3>
            <CheckList items={[
              "Interactive Brokers Client Portal API polling",
              "Tradovate WebSocket integration",
              "TradingView alert webhook",
              "cTrader REST integration",
              "Multi-account support (same broker, different accounts)",
              "Historical backfill — import past 90 days on first connect",
            ]} />
            <H3>Phase 5 — Polish (Weeks 15–16)</H3>
            <CheckList items={[
              "Sync health dashboard (trades/day, last sync time, error rate)",
              "Retry logic and user alerts for failed connections",
              "Rate limit monitoring (track API quota per broker)",
              "Admin panel to monitor all active connections",
            ]} />

            <div className="mt-10 p-6 rounded-xl bg-gradient-to-br from-cyan-500/8 to-transparent border border-cyan-500/15">
              <h3 className="text-sm font-semibold text-cyan-400/70 uppercase tracking-wider mb-4">Quick Reference — Broker API Endpoints</h3>
              <Table
                headers={["Broker", "REST Base URL", "WebSocket URL", "Auth"]}
                rows={[
                  ["Binance",   "api.binance.com",              "stream.binance.com:9443",        "API Key + HMAC"],
                  ["Bybit",     "api.bybit.com",                "stream.bybit.com/v5/private",    "API Key + HMAC"],
                  ["OKX",       "www.okx.com",                  "ws.okx.com:8443",                "API Key + Passphrase"],
                  ["OANDA",     "api-fxtrade.oanda.com",        "stream-fxtrade.oanda.com",       "Bearer Token"],
                  ["Alpaca",    "api.alpaca.markets",           "stream.data.alpaca.markets",     "OAuth 2.0"],
                  ["IBKR",      "localhost:5000 (gateway)",     "—",                              "Session cookie"],
                  ["Tradovate", "api.tradovate.com",            "md.tradovate.com",               "OAuth 2.0"],
                ]}
              />
            </div>
          </Sec>

        </div>
      </div>
    </div>
  );
}
