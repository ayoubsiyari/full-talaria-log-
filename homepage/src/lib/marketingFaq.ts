/** Shared FAQ copy for visible HTML + JSON-LD (keep answers in sync). */
export type MarketingFaqItem = {
  question: string;
  answer: string;
};

export const MARKETING_FAQ_ITEMS: MarketingFaqItem[] = [
  {
    question: "What is Talaria-Log?",
    answer:
      "Talaria-Log is a web-based trading platform for advanced backtesting, session replay, a trading journal, and performance analytics. It combines professional charting with historical data so traders can review and improve their process.",
  },
  {
    question: "Is Talaria-Log a backtesting platform?",
    answer:
      "Yes. Talaria-Log includes a backtesting engine with replayable sessions, multi-timeframe charts, and analytics. You can run structured backtests on historical intraday data and measure results in the journal and dashboard.",
  },
  {
    question: "Who is Talaria-Log for?",
    answer:
      "Serious retail and prop-firm traders who want replay, journaling, and analytics in one place—especially those working with futures, forex, and other liquid markets who need reliable historical bars and session-level review.",
  },
  {
    question: "What features does Talaria-Log include?",
    answer:
      "Professional charting, backtest sessions with replay, trade journal, session analytics, strategy lab, COT data views, and subscription billing via Stripe. See Plans & Pricing on the website for current entitlements.",
  },
  {
    question: "How is Talaria-Log different from only using a charting terminal?",
    answer:
      "Talaria-Log links chart replay, backtest sessions, and journal analytics in one workflow—so you can go from historical review to logged trades and performance metrics without switching disconnected tools.",
  },
  {
    question: "Where can I see pricing?",
    answer:
      "Visit the Plans & Pricing page at /pricing/ on talaria-log.com for current subscription options and checkout.",
  },
];

export const PRODUCT_FEATURE_LIST = [
  "Historical session replay and backtesting",
  "Professional candlestick charts and indicators",
  "Trading journal and trade log",
  "Session and portfolio analytics",
  "Strategy lab",
  "Prop-firm oriented risk and session tools",
] as const;
