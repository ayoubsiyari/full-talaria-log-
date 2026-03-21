/**
 * Market Calculation Engine
 * Correct P&L, position sizing and margin calculations for
 * Forex, Futures, Crypto (linear & inverse), and Stocks.
 *
 * P&L Formulas:
 *   Forex   (USD-quoted)  : priceDiff × lots × contractSize
 *   Forex   (USD-base)    : priceDiff × lots × contractSize / exitPrice
 *   Forex   (cross)       : priceDiff × lots × contractSize / quoteToUSD
 *   Futures               : (priceDiff / tickSize) × tickValue × contracts
 *   Crypto  (linear/spot) : priceDiff × quantity × contractSize
 *   Crypto  (inverse)     : contractSize × qty × (1/entry − 1/exit) × exitPrice
 *   Stocks                : priceDiff × shares
 */

// ─────────────────────────────────────────────────────────────────────────────
// INSTRUMENT REGISTRY
// ─────────────────────────────────────────────────────────────────────────────
const INSTRUMENT_REGISTRY = {

    // ── FOREX ─────────────────────────────────────────────────────────────────
    // USD-quoted pairs  →  pipValue is fixed (pipSize × contractSize in USD)
    'EURUSD': { type:'forex', contractSize:100000, pipSize:0.0001, quoteType:'usd_quoted', precision:5, label:'EUR/USD' },
    'GBPUSD': { type:'forex', contractSize:100000, pipSize:0.0001, quoteType:'usd_quoted', precision:5, label:'GBP/USD' },
    'AUDUSD': { type:'forex', contractSize:100000, pipSize:0.0001, quoteType:'usd_quoted', precision:5, label:'AUD/USD' },
    'NZDUSD': { type:'forex', contractSize:100000, pipSize:0.0001, quoteType:'usd_quoted', precision:5, label:'NZD/USD' },
    'XAUUSD': { type:'forex', contractSize:100,    pipSize:0.01,   quoteType:'usd_quoted', precision:2, label:'XAU/USD' },
    'XAGUSD': { type:'forex', contractSize:5000,   pipSize:0.001,  quoteType:'usd_quoted', precision:3, label:'XAG/USD' },
    'XTIUSD': { type:'forex', contractSize:1000,   pipSize:0.01,   quoteType:'usd_quoted', precision:2, label:'XTI/USD (WTI Oil)' },
    'XNGUSD': { type:'forex', contractSize:10000,  pipSize:0.0001, quoteType:'usd_quoted', precision:4, label:'XNG/USD (Natural Gas)' },

    // USD-base pairs  →  pipValue = pipSize × contractSize / exitPrice
    'USDJPY': { type:'forex', contractSize:100000, pipSize:0.01,   quoteType:'usd_base', precision:3, label:'USD/JPY' },
    'USDCAD': { type:'forex', contractSize:100000, pipSize:0.0001, quoteType:'usd_base', precision:5, label:'USD/CAD' },
    'USDCHF': { type:'forex', contractSize:100000, pipSize:0.0001, quoteType:'usd_base', precision:5, label:'USD/CHF' },
    'USDCNH': { type:'forex', contractSize:100000, pipSize:0.0001, quoteType:'usd_base', precision:5, label:'USD/CNH' },
    'USDHKD': { type:'forex', contractSize:100000, pipSize:0.0001, quoteType:'usd_base', precision:5, label:'USD/HKD' },

    // JPY-cross pairs  →  pipValue = pipSize × contractSize / exitJPYRate
    'EURJPY': { type:'forex', contractSize:100000, pipSize:0.01, quoteType:'cross_jpy', precision:3, label:'EUR/JPY' },
    'GBPJPY': { type:'forex', contractSize:100000, pipSize:0.01, quoteType:'cross_jpy', precision:3, label:'GBP/JPY' },
    'AUDJPY': { type:'forex', contractSize:100000, pipSize:0.01, quoteType:'cross_jpy', precision:3, label:'AUD/JPY' },
    'NZDJPY': { type:'forex', contractSize:100000, pipSize:0.01, quoteType:'cross_jpy', precision:3, label:'NZD/JPY' },
    'CADJPY': { type:'forex', contractSize:100000, pipSize:0.01, quoteType:'cross_jpy', precision:3, label:'CAD/JPY' },
    'CHFJPY': { type:'forex', contractSize:100000, pipSize:0.01, quoteType:'cross_jpy', precision:3, label:'CHF/JPY' },

    // Non-JPY cross pairs  →  pipValue = pipSize × contractSize / quoteToUSD (approx)
    'EURGBP': { type:'forex', contractSize:100000, pipSize:0.0001, quoteType:'cross_usd', precision:5, label:'EUR/GBP' },
    'EURCHF': { type:'forex', contractSize:100000, pipSize:0.0001, quoteType:'cross_usd', precision:5, label:'EUR/CHF' },
    'EURCAD': { type:'forex', contractSize:100000, pipSize:0.0001, quoteType:'cross_usd', precision:5, label:'EUR/CAD' },
    'EURAUD': { type:'forex', contractSize:100000, pipSize:0.0001, quoteType:'cross_usd', precision:5, label:'EUR/AUD' },
    'GBPCHF': { type:'forex', contractSize:100000, pipSize:0.0001, quoteType:'cross_usd', precision:5, label:'GBP/CHF' },
    'GBPCAD': { type:'forex', contractSize:100000, pipSize:0.0001, quoteType:'cross_usd', precision:5, label:'GBP/CAD' },
    'GBPAUD': { type:'forex', contractSize:100000, pipSize:0.0001, quoteType:'cross_usd', precision:5, label:'GBP/AUD' },
    'AUDCAD': { type:'forex', contractSize:100000, pipSize:0.0001, quoteType:'cross_usd', precision:5, label:'AUD/CAD' },
    'AUDCHF': { type:'forex', contractSize:100000, pipSize:0.0001, quoteType:'cross_usd', precision:5, label:'AUD/CHF' },
    'AUDNZD': { type:'forex', contractSize:100000, pipSize:0.0001, quoteType:'cross_usd', precision:5, label:'AUD/NZD' },
    'CADCHF': { type:'forex', contractSize:100000, pipSize:0.0001, quoteType:'cross_usd', precision:5, label:'CAD/CHF' },
    'NZDCAD': { type:'forex', contractSize:100000, pipSize:0.0001, quoteType:'cross_usd', precision:5, label:'NZD/CAD' },
    'NZDCHF': { type:'forex', contractSize:100000, pipSize:0.0001, quoteType:'cross_usd', precision:5, label:'NZD/CHF' },

    // ── FUTURES ───────────────────────────────────────────────────────────────
    // CME Equity Index
    'ES':  { type:'futures', tickSize:0.25,    tickValue:12.50,  contractSize:1, precision:2, label:'S&P 500 (ES)',       exchange:'CME'   },
    'MES': { type:'futures', tickSize:0.25,    tickValue:1.25,   contractSize:1, precision:2, label:'Micro S&P 500 (MES)',exchange:'CME'   },
    'NQ':  { type:'futures', tickSize:0.25,    tickValue:5.00,   contractSize:1, precision:2, label:'Nasdaq 100 (NQ)',    exchange:'CME'   },
    'MNQ': { type:'futures', tickSize:0.25,    tickValue:0.50,   contractSize:1, precision:2, label:'Micro Nasdaq (MNQ)', exchange:'CME'   },
    'YM':  { type:'futures', tickSize:1.00,    tickValue:5.00,   contractSize:1, precision:0, label:'Dow Jones (YM)',     exchange:'CBOT'  },
    'MYM': { type:'futures', tickSize:1.00,    tickValue:0.50,   contractSize:1, precision:0, label:'Micro Dow (MYM)',    exchange:'CBOT'  },
    'RTY': { type:'futures', tickSize:0.10,    tickValue:5.00,   contractSize:1, precision:2, label:'Russell 2000 (RTY)', exchange:'CME'   },
    'M2K': { type:'futures', tickSize:0.10,    tickValue:0.50,   contractSize:1, precision:2, label:'Micro Russell (M2K)',exchange:'CME'   },

    // CME FX Futures
    '6E':  { type:'futures', tickSize:0.00005, tickValue:6.25,   contractSize:1, precision:5, label:'Euro FX (6E)',       exchange:'CME'   },
    '6B':  { type:'futures', tickSize:0.0001,  tickValue:6.25,   contractSize:1, precision:4, label:'British Pound (6B)', exchange:'CME'   },
    '6J':  { type:'futures', tickSize:0.0000005,tickValue:6.25,  contractSize:1, precision:7, label:'Japanese Yen (6J)',  exchange:'CME'   },
    '6A':  { type:'futures', tickSize:0.0001,  tickValue:10.00,  contractSize:1, precision:4, label:'Aussie Dollar (6A)', exchange:'CME'   },
    '6C':  { type:'futures', tickSize:0.0001,  tickValue:10.00,  contractSize:1, precision:4, label:'Canadian Dollar (6C)',exchange:'CME'  },
    '6S':  { type:'futures', tickSize:0.0001,  tickValue:12.50,  contractSize:1, precision:4, label:'Swiss Franc (6S)',   exchange:'CME'   },

    // NYMEX / COMEX Energy & Metals
    'CL':  { type:'futures', tickSize:0.01,    tickValue:10.00,  contractSize:1, precision:2, label:'Crude Oil (CL)',     exchange:'NYMEX' },
    'MCL': { type:'futures', tickSize:0.01,    tickValue:1.00,   contractSize:1, precision:2, label:'Micro Crude (MCL)',  exchange:'NYMEX' },
    'RB':  { type:'futures', tickSize:0.0001,  tickValue:4.20,   contractSize:1, precision:4, label:'RBOB Gasoline (RB)', exchange:'NYMEX' },
    'NG':  { type:'futures', tickSize:0.001,   tickValue:10.00,  contractSize:1, precision:3, label:'Natural Gas (NG)',   exchange:'NYMEX' },
    'GC':  { type:'futures', tickSize:0.10,    tickValue:10.00,  contractSize:1, precision:1, label:'Gold (GC)',          exchange:'COMEX' },
    'MGC': { type:'futures', tickSize:0.10,    tickValue:1.00,   contractSize:1, precision:1, label:'Micro Gold (MGC)',   exchange:'COMEX' },
    'SI':  { type:'futures', tickSize:0.005,   tickValue:25.00,  contractSize:1, precision:3, label:'Silver (SI)',        exchange:'COMEX' },
    'HG':  { type:'futures', tickSize:0.0005,  tickValue:12.50,  contractSize:1, precision:4, label:'Copper (HG)',        exchange:'COMEX' },
    'PL':  { type:'futures', tickSize:0.10,    tickValue:5.00,   contractSize:1, precision:1, label:'Platinum (PL)',      exchange:'NYMEX' },

    // CBOT Fixed Income
    'ZB':  { type:'futures', tickSize:0.03125, tickValue:31.25,  contractSize:1, precision:5, label:'T-Bond 30Y (ZB)',    exchange:'CBOT'  },
    'ZN':  { type:'futures', tickSize:0.015625,tickValue:15.625, contractSize:1, precision:6, label:'10-Year Note (ZN)',  exchange:'CBOT'  },
    'ZF':  { type:'futures', tickSize:0.0078125,tickValue:7.8125,contractSize:1, precision:7, label:'5-Year Note (ZF)',   exchange:'CBOT'  },
    'ZT':  { type:'futures', tickSize:0.00390625,tickValue:7.8125,contractSize:1,precision:8, label:'2-Year Note (ZT)',   exchange:'CBOT'  },

    // CBOT Grains
    'ZC':  { type:'futures', tickSize:0.25,    tickValue:12.50,  contractSize:1, precision:2, label:'Corn (ZC)',          exchange:'CBOT'  },
    'ZW':  { type:'futures', tickSize:0.25,    tickValue:12.50,  contractSize:1, precision:2, label:'Wheat (ZW)',         exchange:'CBOT'  },
    'ZS':  { type:'futures', tickSize:0.25,    tickValue:12.50,  contractSize:1, precision:2, label:'Soybeans (ZS)',      exchange:'CBOT'  },

    // ── CRYPTO (Linear / USDT-margined) ───────────────────────────────────────
    'BTCUSDT':  { type:'crypto', contractType:'linear', contractSize:1, precision:1, minQty:0.001, qtyStep:0.001, label:'BTC/USDT' },
    'ETHUSDT':  { type:'crypto', contractType:'linear', contractSize:1, precision:2, minQty:0.01,  qtyStep:0.01,  label:'ETH/USDT' },
    'SOLUSDT':  { type:'crypto', contractType:'linear', contractSize:1, precision:3, minQty:0.01,  qtyStep:0.01,  label:'SOL/USDT' },
    'BNBUSDT':  { type:'crypto', contractType:'linear', contractSize:1, precision:2, minQty:0.01,  qtyStep:0.01,  label:'BNB/USDT' },
    'XRPUSDT':  { type:'crypto', contractType:'linear', contractSize:1, precision:4, minQty:1,     qtyStep:1,     label:'XRP/USDT' },
    'ADAUSDT':  { type:'crypto', contractType:'linear', contractSize:1, precision:4, minQty:1,     qtyStep:1,     label:'ADA/USDT' },
    'DOGEUSDT': { type:'crypto', contractType:'linear', contractSize:1, precision:5, minQty:1,     qtyStep:1,     label:'DOGE/USDT' },
    'LTCUSDT':  { type:'crypto', contractType:'linear', contractSize:1, precision:3, minQty:0.01,  qtyStep:0.01,  label:'LTC/USDT' },
    'LINKUSDT': { type:'crypto', contractType:'linear', contractSize:1, precision:3, minQty:0.1,   qtyStep:0.1,   label:'LINK/USDT' },
    'DOTUSDT':  { type:'crypto', contractType:'linear', contractSize:1, precision:3, minQty:0.1,   qtyStep:0.1,   label:'DOT/USDT' },
    'AVAXUSDT': { type:'crypto', contractType:'linear', contractSize:1, precision:3, minQty:0.1,   qtyStep:0.1,   label:'AVAX/USDT' },
    'MATICUSDT':{ type:'crypto', contractType:'linear', contractSize:1, precision:4, minQty:1,     qtyStep:1,     label:'MATIC/USDT' },

    // Crypto Spot (BTC/USD style)
    'BTCUSD':   { type:'crypto', contractType:'spot', contractSize:1, precision:1, minQty:0.001, qtyStep:0.001, label:'BTC/USD' },
    'ETHUSD':   { type:'crypto', contractType:'spot', contractSize:1, precision:2, minQty:0.01,  qtyStep:0.01,  label:'ETH/USD' },
    'SOLUSD':   { type:'crypto', contractType:'spot', contractSize:1, precision:3, minQty:0.01,  qtyStep:0.01,  label:'SOL/USD' },

    // Crypto Inverse (coin-margined, e.g. Bitmex XBTUSD)
    'XBTUSD':   { type:'crypto', contractType:'inverse', contractSize:1, precision:1, minQty:1, qtyStep:1, label:'XBT/USD (Inverse)' },
    'ETHUSD_I': { type:'crypto', contractType:'inverse', contractSize:1, precision:2, minQty:1, qtyStep:1, label:'ETH/USD (Inverse)' },

    // ── STOCKS / ETFs ────────────────────────────────────────────────────────
    'AAPL':  { type:'stocks', contractSize:1, precision:2, minQty:1, qtyStep:1, label:'Apple Inc.' },
    'TSLA':  { type:'stocks', contractSize:1, precision:2, minQty:1, qtyStep:1, label:'Tesla Inc.' },
    'NVDA':  { type:'stocks', contractSize:1, precision:2, minQty:1, qtyStep:1, label:'Nvidia Corp.' },
    'MSFT':  { type:'stocks', contractSize:1, precision:2, minQty:1, qtyStep:1, label:'Microsoft Corp.' },
    'AMZN':  { type:'stocks', contractSize:1, precision:2, minQty:1, qtyStep:1, label:'Amazon.com Inc.' },
    'GOOGL': { type:'stocks', contractSize:1, precision:2, minQty:1, qtyStep:1, label:'Alphabet Inc.' },
    'META':  { type:'stocks', contractSize:1, precision:2, minQty:1, qtyStep:1, label:'Meta Platforms' },
    'NFLX':  { type:'stocks', contractSize:1, precision:2, minQty:1, qtyStep:1, label:'Netflix Inc.' },
    'AMD':   { type:'stocks', contractSize:1, precision:2, minQty:1, qtyStep:1, label:'AMD Inc.' },
    'INTC':  { type:'stocks', contractSize:1, precision:2, minQty:1, qtyStep:1, label:'Intel Corp.' },
    'SPY':   { type:'stocks', contractSize:1, precision:2, minQty:1, qtyStep:1, label:'SPDR S&P 500 ETF' },
    'QQQ':   { type:'stocks', contractSize:1, precision:2, minQty:1, qtyStep:1, label:'Invesco QQQ ETF' },
    'IWM':   { type:'stocks', contractSize:1, precision:2, minQty:1, qtyStep:1, label:'iShares Russell 2000 ETF' },
    'DIA':   { type:'stocks', contractSize:1, precision:2, minQty:1, qtyStep:1, label:'SPDR Dow Jones ETF' },
};


// ─────────────────────────────────────────────────────────────────────────────
// FOREX CALCULATOR
// ─────────────────────────────────────────────────────────────────────────────
class ForexCalculator {
    /**
     * @param {object} specs - from INSTRUMENT_REGISTRY (type:'forex')
     */
    constructor(specs) {
        this.specs = specs;
    }

    /**
     * Pip value per standard lot in USD.
     * Requires currentPrice for USD-base and cross pairs.
     * @param {number} [currentPrice]
     * @returns {number} USD per pip per lot
     */
    calcPipValuePerLot(currentPrice) {
        const { contractSize, pipSize, quoteType } = this.specs;
        switch (quoteType) {
            case 'usd_quoted':
                // EUR/USD, GBP/USD, XAU/USD: fixed
                return pipSize * contractSize;

            case 'usd_base':
                // USD/JPY, USD/CAD: 1 pip is worth pipSize units of quote currency
                // Convert to USD: pip_value_quote / price = pip_value_usd
                if (!currentPrice || currentPrice === 0) return pipSize * contractSize;
                return (pipSize * contractSize) / currentPrice;

            case 'cross_jpy':
                // EUR/JPY, GBP/JPY: pip is in JPY, need JPY→USD conversion
                // Approximate: pip_value_usd ≈ pipSize × contractSize / currentPrice
                if (!currentPrice || currentPrice === 0) return pipSize * contractSize;
                return (pipSize * contractSize) / currentPrice;

            case 'cross_usd':
                // EUR/GBP, GBP/CHF: quote is not USD, approximate using current price
                if (!currentPrice || currentPrice === 0) return pipSize * contractSize;
                return (pipSize * contractSize) / currentPrice;

            default:
                return pipSize * contractSize;
        }
    }

    /**
     * P&L in USD.
     * @param {'BUY'|'SELL'} side
     * @param {number} entry
     * @param {number} exit
     * @param {number} lots
     * @param {number} [currentPrice] - needed for USD-base / cross pairs
     */
    calcPnL(side, entry, exit, lots, currentPrice) {
        const { contractSize, pipSize } = this.specs;
        const direction = side === 'BUY' ? 1 : -1;
        const priceDiff = (exit - entry) * direction;
        const pips = priceDiff / pipSize;
        return pips * this.calcPipValuePerLot(currentPrice || exit) * lots;
    }

    /**
     * Position size in lots.
     * lots = riskUSD / (slPips × pipValuePerLot)
     * @param {number} riskUSD
     * @param {number} entry
     * @param {number} sl - stop loss price
     * @param {number} [currentPrice]
     * @returns {number} lots (unrounded)
     */
    calcPositionSize(riskUSD, entry, sl, currentPrice) {
        const { pipSize } = this.specs;
        if (!sl || !riskUSD || Math.abs(entry - sl) < 1e-10) return 0;
        const slPips = Math.abs(entry - sl) / pipSize;
        const pipVal = this.calcPipValuePerLot(currentPrice || entry);
        if (slPips === 0 || pipVal === 0) return 0;
        return riskUSD / (slPips * pipVal);
    }

    /**
     * Actual risk in USD for a position.
     * @param {number} entry
     * @param {number} sl
     * @param {number} lots
     * @param {number} [currentPrice]
     */
    calcRisk(entry, sl, lots, currentPrice) {
        if (!sl || lots <= 0) return 0;
        const { pipSize } = this.specs;
        const slPips = Math.abs(entry - sl) / pipSize;
        return slPips * this.calcPipValuePerLot(currentPrice || entry) * lots;
    }

    /**
     * Margin required in USD.
     * margin = (entry × lots × contractSize) / leverage
     */
    calcMargin(entry, lots, leverage = 100) {
        return (entry * lots * this.specs.contractSize) / leverage;
    }

    getSpecs() {
        const pv = this.calcPipValuePerLot();
        return {
            type:           'forex',
            quoteType:      this.specs.quoteType,
            pipSize:        this.specs.pipSize,
            pipValuePerLot: pv,
            contractSize:   this.specs.contractSize,
            positionLabel:  'Lots',
            sizeStep:       0.01,
            minSize:        0.01,
            showPips:       true,
            precision:      this.specs.precision,
            label:          this.specs.label,
        };
    }

    formatQty(qty)         { return Number(qty).toFixed(2) + ' Lots'; }
    formatPrice(price)     { return Number(price).toFixed(this.specs.precision); }
    formatPips(priceDist)  { return (Math.abs(priceDist) / this.specs.pipSize).toFixed(1) + ' pips'; }
}


// ─────────────────────────────────────────────────────────────────────────────
// FUTURES CALCULATOR
// ─────────────────────────────────────────────────────────────────────────────
class FuturesCalculator {
    /**
     * @param {object} specs - from INSTRUMENT_REGISTRY (type:'futures')
     */
    constructor(specs) {
        this.specs = specs;
    }

    /**
     * P&L = ticks × tickValue × contracts
     * @param {'BUY'|'SELL'} side
     * @param {number} entry
     * @param {number} exit
     * @param {number} contracts
     */
    calcPnL(side, entry, exit, contracts) {
        const { tickSize, tickValue } = this.specs;
        const direction = side === 'BUY' ? 1 : -1;
        const ticks = ((exit - entry) * direction) / tickSize;
        return ticks * tickValue * contracts;
    }

    /**
     * Position size in contracts (always integers for futures).
     * contracts = floor( riskUSD / (slTicks × tickValue) )
     * @param {number} riskUSD
     * @param {number} entry
     * @param {number} sl
     * @returns {number} whole contracts
     */
    calcPositionSize(riskUSD, entry, sl) {
        const { tickSize, tickValue } = this.specs;
        if (!sl || !riskUSD || Math.abs(entry - sl) < 1e-10) return 0;
        const slTicks = Math.abs(entry - sl) / tickSize;
        const riskPerContract = slTicks * tickValue;
        if (riskPerContract === 0) return 0;
        return Math.max(1, Math.floor(riskUSD / riskPerContract));
    }

    /**
     * Actual risk for a position.
     */
    calcRisk(entry, sl, contracts) {
        const { tickSize, tickValue } = this.specs;
        if (!sl || contracts <= 0) return 0;
        const slTicks = Math.abs(entry - sl) / tickSize;
        return slTicks * tickValue * contracts;
    }

    /**
     * Point value (USD per full point move per contract).
     */
    getPointValue() {
        return this.specs.tickValue / this.specs.tickSize;
    }

    getSpecs() {
        return {
            type:          'futures',
            tickSize:      this.specs.tickSize,
            tickValue:     this.specs.tickValue,
            pointValue:    this.getPointValue(),
            contractSize:  this.specs.contractSize,
            positionLabel: 'Contracts',
            sizeStep:      1,
            minSize:       1,
            showPips:      false,
            showTicks:     true,
            precision:     this.specs.precision,
            label:         this.specs.label,
            exchange:      this.specs.exchange,
        };
    }

    formatQty(qty)        { return Math.round(qty) + (Math.round(qty) === 1 ? ' Contract' : ' Contracts'); }
    formatPrice(price)    { return Number(price).toFixed(this.specs.precision); }
    formatTicks(dist)     { return (Math.abs(dist) / this.specs.tickSize).toFixed(0) + ' ticks'; }
    formatPoints(dist)    { return Math.abs(dist).toFixed(this.specs.precision) + ' pts'; }
}


// ─────────────────────────────────────────────────────────────────────────────
// CRYPTO CALCULATOR
// ─────────────────────────────────────────────────────────────────────────────
class CryptoCalculator {
    /**
     * @param {object} specs - from INSTRUMENT_REGISTRY (type:'crypto')
     */
    constructor(specs) {
        this.specs = specs;
    }

    /**
     * P&L in USD.
     *
     * Linear / Spot:
     *   pnl = (exit − entry) × qty × contractSize × direction
     *
     * Inverse (coin-margined, e.g. Bitmex XBTUSD):
     *   pnl_coin = contractSize × qty × (1/entry − 1/exit) × direction
     *   pnl_usd  = pnl_coin × exit
     *
     * @param {'BUY'|'SELL'} side
     * @param {number} entry
     * @param {number} exit
     * @param {number} qty - units/contracts
     */
    calcPnL(side, entry, exit, qty) {
        const { contractType, contractSize } = this.specs;
        const direction = side === 'BUY' ? 1 : -1;

        if (contractType === 'inverse') {
            const pnlInCoin = contractSize * qty * (1 / entry - 1 / exit) * direction;
            return pnlInCoin * exit;
        }

        // Linear or Spot
        return (exit - entry) * direction * qty * contractSize;
    }

    /**
     * Position size from fixed dollar risk.
     *
     * Linear / Spot:
     *   qty = riskUSD / (|entry − sl| × contractSize)
     *
     * Inverse:
     *   riskPerContract ≈ |1/sl − 1/entry| × contractSize × entry   (in USD)
     *
     * @param {number} riskUSD
     * @param {number} entry
     * @param {number} sl
     * @param {number} [leverage=1] - for margin sizing display (does NOT affect P&L)
     */
    calcPositionSize(riskUSD, entry, sl, leverage = 1) {
        const { contractType, contractSize } = this.specs;
        if (!sl || !riskUSD || Math.abs(entry - sl) < 1e-10) return 0;

        if (contractType === 'inverse') {
            const riskPerContract = Math.abs(1 / sl - 1 / entry) * contractSize * entry;
            return riskPerContract === 0 ? 0 : riskUSD / riskPerContract;
        }

        // Linear / Spot
        const priceDist = Math.abs(entry - sl);
        return riskUSD / (priceDist * contractSize);
    }

    /**
     * Actual risk for a position.
     */
    calcRisk(entry, sl, qty) {
        if (!sl || qty <= 0) return 0;
        return Math.abs(this.calcPnL('BUY', entry, sl, qty));
    }

    /**
     * Margin required in USD.
     * margin = (entry × qty × contractSize) / leverage
     */
    calcMargin(entry, qty, leverage = 1) {
        return (entry * qty * this.specs.contractSize) / Math.max(1, leverage);
    }

    /**
     * Liquidation price (simplified).
     * For linear longs:  liqPrice = entry × (1 − 1/leverage + maintenanceMargin)
     */
    calcLiquidationPrice(side, entry, leverage = 1, maintenanceMarginRate = 0.005) {
        const { contractType } = this.specs;
        if (leverage <= 1) return null;
        if (contractType === 'inverse') {
            return side === 'BUY'
                ? entry / (1 + 1 / leverage - maintenanceMarginRate)
                : entry / (1 - 1 / leverage + maintenanceMarginRate);
        }
        return side === 'BUY'
            ? entry * (1 - 1 / leverage + maintenanceMarginRate)
            : entry * (1 + 1 / leverage - maintenanceMarginRate);
    }

    getSpecs() {
        const { contractType, contractSize, qtyStep, minQty, precision, label } = this.specs;
        const isFutures = contractType === 'inverse';
        return {
            type:          'crypto',
            contractType,
            contractSize,
            positionLabel: isFutures ? 'Contracts' : 'Units',
            sizeStep:      qtyStep,
            minSize:       minQty,
            showPips:      false,
            showPercent:   true,
            showLeverage:  true,
            precision,
            label,
        };
    }

    formatQty(qty) {
        const { qtyStep, label } = this.specs;
        const decimals = qtyStep < 0.001 ? 4 : qtyStep < 0.01 ? 3 : qtyStep < 0.1 ? 2 : 0;
        const base = label ? label.split('/')[0].replace(' (Inverse)', '') : 'Units';
        return Number(qty).toFixed(decimals) + ' ' + base;
    }

    formatPrice(price) { return Number(price).toFixed(this.specs.precision); }
}


// ─────────────────────────────────────────────────────────────────────────────
// STOCKS CALCULATOR
// ─────────────────────────────────────────────────────────────────────────────
class StocksCalculator {
    /**
     * @param {object} specs - from INSTRUMENT_REGISTRY (type:'stocks')
     */
    constructor(specs) {
        this.specs = specs;
    }

    /** pnl = (exit − entry) × shares × direction */
    calcPnL(side, entry, exit, shares) {
        return (exit - entry) * (side === 'BUY' ? 1 : -1) * shares;
    }

    /** shares = floor( riskUSD / |entry − sl| ) */
    calcPositionSize(riskUSD, entry, sl) {
        const dist = Math.abs(entry - sl);
        if (!sl || !riskUSD || dist < 1e-10) return 0;
        return Math.floor(riskUSD / dist);
    }

    calcRisk(entry, sl, shares) {
        return Math.abs(entry - sl) * shares;
    }

    /** Full-price margin (no leverage by default) */
    calcMargin(entry, shares, leverage = 1) {
        return (entry * shares) / Math.max(1, leverage);
    }

    getSpecs() {
        return {
            type:          'stocks',
            contractSize:  1,
            positionLabel: 'Shares',
            sizeStep:      1,
            minSize:       1,
            showPips:      false,
            showPercent:   true,
            showLeverage:  false,
            precision:     this.specs.precision,
            label:         this.specs.label,
        };
    }

    formatQty(qty)     { return Math.round(qty) + (Math.round(qty) === 1 ? ' Share' : ' Shares'); }
    formatPrice(price) { return '$' + Number(price).toFixed(this.specs.precision); }
}


// ─────────────────────────────────────────────────────────────────────────────
// MARKET CALCULATION ENGINE  (facade / entry point)
// ─────────────────────────────────────────────────────────────────────────────
class MarketCalculationEngine {
    constructor() {
        this._registry = INSTRUMENT_REGISTRY;
        this._cache    = new Map();
    }

    // ── Symbol helpers ────────────────────────────────────────────────────────

    /**
     * Normalise symbol to registry key format.
     * e.g. 'EUR/USD' → 'EURUSD',  'BTC-USDT' → 'BTCUSDT'
     */
    _normalize(symbol) {
        if (!symbol) return '';
        return symbol.replace(/[/\-_\s]/g, '').toUpperCase();
    }

    /**
     * Lookup specs in registry; build a reasonable fallback if unknown.
     */
    getSpecs(symbol, fallbackType) {
        const key  = this._normalize(symbol);
        const spec = this._registry[key];
        if (spec) return spec;
        return this._fallback(fallbackType || MarketCalculationEngine.detectMarketType(symbol), symbol);
    }

    _fallback(type, symbol) {
        const label = symbol || type;
        const defaults = {
            forex:   { type:'forex',   contractSize:100000, pipSize:0.0001, quoteType:'usd_quoted', precision:5, label },
            futures: { type:'futures', tickSize:0.25, tickValue:12.50, contractSize:1, precision:2, label, exchange:'?' },
            crypto:  { type:'crypto',  contractType:'linear', contractSize:1, precision:2, minQty:0.01, qtyStep:0.01, label },
            stocks:  { type:'stocks',  contractSize:1, precision:2, minQty:1, qtyStep:1, label },
        };
        return defaults[type] || defaults.forex;
    }

    // ── Calculator factory ────────────────────────────────────────────────────

    /**
     * Get a calculator instance for the given symbol.
     * Results are cached by normalised key.
     */
    getCalculator(symbol, fallbackType) {
        const key = this._normalize(symbol) || (fallbackType || 'forex');
        if (this._cache.has(key)) return this._cache.get(key);

        const specs = this.getSpecs(symbol, fallbackType);
        let calc;
        switch (specs.type) {
            case 'futures': calc = new FuturesCalculator(specs); break;
            case 'crypto':  calc = new CryptoCalculator(specs);  break;
            case 'stocks':  calc = new StocksCalculator(specs);  break;
            default:        calc = new ForexCalculator(specs);   break;
        }
        this._cache.set(key, calc);
        return calc;
    }

    // ── Main API ──────────────────────────────────────────────────────────────

    /**
     * Calculate closed P&L in USD.
     * @param {'BUY'|'SELL'} side
     * @param {number} entry
     * @param {number} exit
     * @param {number} quantity - lots / contracts / units / shares
     * @param {string} symbol
     * @param {string} [fallbackType]
     * @param {number} [currentPrice] - required for some forex cross pairs
     */
    calcPnL(side, entry, exit, quantity, symbol, fallbackType, currentPrice) {
        const calc = this.getCalculator(symbol, fallbackType);
        if (calc instanceof ForexCalculator) {
            return calc.calcPnL(side, entry, exit, quantity, currentPrice || exit);
        }
        return calc.calcPnL(side, entry, exit, quantity);
    }

    /**
     * Calculate correct position size from a risk amount.
     * @param {number} riskUSD
     * @param {number} entry
     * @param {number} sl
     * @param {string} symbol
     * @param {string} [fallbackType]
     * @param {number} [leverage]
     * @param {number} [currentPrice]
     */
    calcPositionSize(riskUSD, entry, sl, symbol, fallbackType, leverage, currentPrice) {
        const calc = this.getCalculator(symbol, fallbackType);
        if (calc instanceof ForexCalculator) {
            return calc.calcPositionSize(riskUSD, entry, sl, currentPrice || entry);
        }
        if (calc instanceof CryptoCalculator) {
            return calc.calcPositionSize(riskUSD, entry, sl, leverage || 1);
        }
        return calc.calcPositionSize(riskUSD, entry, sl);
    }

    /**
     * Calculate actual risk in USD for a position.
     */
    calcRisk(entry, sl, quantity, symbol, fallbackType, currentPrice) {
        const calc = this.getCalculator(symbol, fallbackType);
        if (calc instanceof ForexCalculator) {
            return calc.calcRisk(entry, sl, quantity, currentPrice || entry);
        }
        return calc.calcRisk(entry, sl, quantity);
    }

    /**
     * Calculate margin required in USD.
     */
    calcMargin(entry, quantity, symbol, fallbackType, leverage) {
        return this.getCalculator(symbol, fallbackType).calcMargin(entry, quantity, leverage || 1);
    }

    /** Format quantity display string (e.g. "0.10 Lots", "2 Contracts", "0.5 BTC") */
    formatQty(qty, symbol, fallbackType) {
        return this.getCalculator(symbol, fallbackType).formatQty(qty);
    }

    /** Format price display string with correct decimal places */
    formatPrice(price, symbol, fallbackType) {
        return this.getCalculator(symbol, fallbackType).formatPrice(price);
    }

    /**
     * Format price distance as native units (pips for forex, ticks for futures, price for crypto).
     */
    formatDistance(priceDist, symbol, fallbackType) {
        const calc = this.getCalculator(symbol, fallbackType);
        if (calc instanceof ForexCalculator)   return calc.formatPips(priceDist);
        if (calc instanceof FuturesCalculator) return calc.formatTicks(priceDist);
        return Math.abs(priceDist).toFixed(calc.specs.precision) + ' pts';
    }

    /** Full display-spec object for use in UI rendering */
    getDisplaySpecs(symbol, fallbackType) {
        return this.getCalculator(symbol, fallbackType).getSpecs();
    }

    /** Return all registered symbols for a given type */
    getSymbolsByType(type) {
        return Object.entries(this._registry)
            .filter(([, s]) => s.type === type)
            .map(([key, s]) => ({ key, ...s }));
    }

    // ── Static helpers ────────────────────────────────────────────────────────

    /**
     * Heuristically detect market type from a symbol string.
     * Used as fallback when symbol is not in the registry.
     */
    static detectMarketType(symbol) {
        if (!symbol) return 'forex';
        const s = symbol.replace(/[/\-_\s]/g, '').toUpperCase();

        const futuresSymbols = [
            'ES','MES','NQ','MNQ','YM','MYM','RTY','M2K',
            'CL','MCL','GC','MGC','SI','HG','PL','RB','NG',
            'ZB','ZN','ZF','ZT','ZC','ZW','ZS',
            '6E','6B','6J','6A','6C','6S',
        ];
        if (futuresSymbols.includes(s)) return 'futures';

        if (s.endsWith('USDT') || s.endsWith('PERP') ||
            ['BTCUSD','ETHUSD','SOLUSD','XBTUSD'].includes(s)) return 'crypto';

        const stockSymbols = [
            'AAPL','TSLA','NVDA','MSFT','AMZN','GOOGL','META',
            'NFLX','AMD','INTC','SPY','QQQ','IWM','DIA',
        ];
        if (stockSymbols.includes(s)) return 'stocks';

        return 'forex';
    }

    /**
     * Quick summary of what a $1 move means for a given symbol.
     * Useful for displaying in the order panel.
     */
    getDollarPerPoint(symbol, fallbackType, quantity = 1, currentPrice = null) {
        const calc = this.getCalculator(symbol, fallbackType);
        if (calc instanceof FuturesCalculator) {
            return calc.getPointValue() * quantity;
        }
        if (calc instanceof ForexCalculator) {
            const specs = calc.getSpecs();
            const pv = calc.calcPipValuePerLot(currentPrice);
            const pipsPerPoint = 1 / specs.pipSize;
            return pv * pipsPerPoint * quantity;
        }
        // Crypto / Stocks: $1 move = $1 per unit
        return quantity;
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL SINGLETON + EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.INSTRUMENT_REGISTRY        = INSTRUMENT_REGISTRY;
    window.ForexCalculator            = ForexCalculator;
    window.FuturesCalculator          = FuturesCalculator;
    window.CryptoCalculator           = CryptoCalculator;
    window.StocksCalculator           = StocksCalculator;
    window.MarketCalculationEngine    = MarketCalculationEngine;

    // Singleton — use this everywhere
    if (!window.marketCalcEngine) {
        window.marketCalcEngine = new MarketCalculationEngine();
    }

    console.log('✅ MarketCalculationEngine loaded — ' +
        Object.keys(INSTRUMENT_REGISTRY).length + ' instruments registered');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        INSTRUMENT_REGISTRY,
        ForexCalculator,
        FuturesCalculator,
        CryptoCalculator,
        StocksCalculator,
        MarketCalculationEngine,
    };
}
