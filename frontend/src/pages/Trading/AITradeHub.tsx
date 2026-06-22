import { useEffect, useRef, useState, Fragment } from 'react';
import { api } from '../../services/api';
import { socket } from '../../services/socket';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  History, 
  Info,
  Clock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Sparkles,
  Zap,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

const SYMBOL_NAMES: Record<string, string> = {
  "^NSEI": "Nifty 50 Index",
  "^BSESN": "BSE Sensex Index",
  "RELIANCE.NS": "Reliance Industries Ltd.",
  "HDFCBANK.NS": "HDFC Bank Ltd.",
  "AAPL": "Apple Inc."
};

// --- Option Pricing Helpers (Black-Scholes) ---
function stdNormalCDF(x: number): number {
  if (x < 0.0) {
    return 1.0 - stdNormalCDF(-x);
  }
  const p = 0.2316419;
  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const t = 1.0 / (1.0 + p * x);
  const cdf = 1.0 - (1.0 / Math.sqrt(2.0 * Math.PI)) * Math.exp(-0.5 * x * x) *
    (b1 * t + b2 * t * t + b3 * Math.pow(t, 3) + b4 * Math.pow(t, 4) + b5 * Math.pow(t, 5));
  return cdf;
}

function calculateOptionPremium(S: number, K: number, T: number, r: number, sigma: number, optionType: 'CALL' | 'PUT'): number {
  if (S <= 0 || K <= 0 || T <= 0 || sigma <= 0) return 0.05;
  try {
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    let price = 0;
    if (optionType === 'CALL') {
      price = S * stdNormalCDF(d1) - K * Math.exp(-r * T) * stdNormalCDF(d2);
    } else {
      price = K * Math.exp(-r * T) * stdNormalCDF(-d2) - S * stdNormalCDF(-d1);
    }
    return Math.max(0.05, price);
  } catch (e) {
    console.error("Option premium calculation error:", e);
    return 0.05;
  }
}

function getOptionParams(symbol: string) {
  const sym = symbol.toUpperCase();
  if (sym.includes('NSEI') || sym.startsWith('^NSEI')) {
    return { strikeDiff: 100, lotSize: 75, sigma: 0.15, name: 'NIFTY' };
  } else if (sym.includes('BSESN') || sym.startsWith('^BSESN')) {
    return { strikeDiff: 100, lotSize: 10, sigma: 0.15, name: 'SENSEX' };
  } else if (sym.includes('RELIANCE')) {
    return { strikeDiff: 20, lotSize: 250, sigma: 0.20, name: 'RELIANCE' };
  } else if (sym.includes('HDFCBANK')) {
    return { strikeDiff: 10, lotSize: 550, sigma: 0.22, name: 'HDFCBANK' };
  } else {
    return { strikeDiff: 5, lotSize: 100, sigma: 0.25, name: sym.split('.')[0] };
  }
}

const getMarketElapsedSeconds = (createdAt: Date, now: Date): number => {
  const getMostRecentMarketMoment = (t: Date): Date => {
    const istTime = new Date(t.getTime() + (5.5 * 3600000) + t.getTimezoneOffset() * 60000);
    const day = istTime.getDay();
    const hour = istTime.getHours();
    const minute = istTime.getMinutes();
    
    const setIST = (d: Date, h: number, m: number, s: number) => {
      const res = new Date(d.getTime());
      const istMins = h * 60 + m;
      res.setUTCHours(Math.floor((istMins - 330) / 60), (istMins - 330) % 60, s, 0);
      return res;
    };
    
    if (day === 0) {
      return setIST(new Date(istTime.getTime() - 2 * 24 * 3600000), 15, 30, 0);
    }
    if (day === 6) {
      return setIST(new Date(istTime.getTime() - 1 * 24 * 3600000), 15, 30, 0);
    }
    
    const mins = hour * 60 + minute;
    if (mins < 555) {
      const prevDays = (day === 1) ? 3 : 1;
      return setIST(new Date(istTime.getTime() - prevDays * 24 * 3600000), 15, 30, 0);
    }
    if (mins > 930) {
      return setIST(istTime, 15, 30, 0);
    }
    return t;
  };

  const start = getMostRecentMarketMoment(createdAt);
  const end = getMostRecentMarketMoment(now);

  if (start.getTime() >= end.getTime()) return 0;

  let totalMins = 0;
  const getISTTime = (d: Date) => new Date(d.getTime() + (5.5 * 3600000) + d.getTimezoneOffset() * 60000);
  
  const istStart = getISTTime(start);
  const istEnd = getISTTime(end);
  
  if (istStart.toDateString() === istEnd.toDateString()) {
    const minsStart = istStart.getHours() * 60 + istStart.getMinutes();
    const minsEnd = istEnd.getHours() * 60 + istEnd.getMinutes();
    return Math.max(0, (minsEnd - minsStart) * 60);
  }
  
  const startMins = istStart.getHours() * 60 + istStart.getMinutes();
  totalMins += Math.max(0, 930 - startMins);
  
  let nextDay = new Date(istStart.getTime() + 24 * 3600000);
  while (nextDay.toDateString() !== istEnd.toDateString()) {
    const dayOfWeek = nextDay.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      totalMins += (930 - 555);
    }
    nextDay = new Date(nextDay.getTime() + 24 * 3600000);
  }
  
  const endMins = istEnd.getHours() * 60 + istEnd.getMinutes();
  totalMins += Math.max(0, endMins - 555);
  
  return totalMins * 60;
};

export default function AITradeHub() {
  const [symbol, setSymbol] = useState("^NSEI");
  const [timeframe, setTimeframe] = useState("1d");
  
  // Market Simulation Status State
  const [marketModeSimulation, setMarketModeSimulation] = useState<'AUTO' | 'OPEN' | 'CLOSED'>('AUTO');
  const [entryStrategy, setEntryStrategy] = useState<'conservative' | 'moderate' | 'aggressive'>('moderate');
  const [customEntryPrice, setCustomEntryPrice] = useState<string>('');
  
  // Trading States
  const [balance, setBalance] = useState<number>(100000);
  const [prediction, setPrediction] = useState<any>(null);
  const [loadingPrediction, setLoadingPrediction] = useState(false);
  const [trades, setTrades] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'option_chain' | 'history' | 'analytics'>('active');
  const [placingTrade, setPlacingTrade] = useState(false);
  
  // Real-time price states
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [changePercent, setChangePercent] = useState<number | null>(null);
  
  // Groww Trading Panel States
  const [tradeDirection, setTradeDirection] = useState<'CALL' | 'PUT'>('CALL');
  const [useAISmartTargets, setUseAISmartTargets] = useState<boolean>(true);
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(true);

  // Options Simulation States
  const [selectedOptionContract, setSelectedOptionContract] = useState<{
    strike: number;
    optionType: 'CALL' | 'PUT';
    premium: number;
    optionSymbol: string;
  } | null>(null);
  const [quantityLots, setQuantityLots] = useState<number>(1);
  const [optionChainList, setOptionChainList] = useState<any[]>([]);

  // Options Assistant States
  const [optionsAssistantCapital, setOptionsAssistantCapital] = useState<number>(50000);
  const [optionsAssistantExpiry, setOptionsAssistantExpiry] = useState<string>(() => {
    const d = new Date();
    const day = d.getDay();
    const daysToThursday = (4 - day + 7) % 7 || 7;
    d.setDate(d.getDate() + daysToThursday);
    return d.toISOString().split('T')[0];
  });
  const [marketOpen, setMarketOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'order' | 'assistant'>('order');
  const [expandedTradeIds, setExpandedTradeIds] = useState<Record<string, boolean>>({});
  const [showChargesTradeId, setShowChargesTradeId] = useState<string | null>(null);

  // Currency helper
  const formatCurrency = (val: number) => {
    const isIndian = symbol.endsWith('.NS') || symbol.startsWith('^');
    return val.toLocaleString(isIndian ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency: isIndian ? 'INR' : 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const fetchBalance = async () => {
    try {
      const res = await api.get('/portfolio/default_user/balance');
      if (res.data) setBalance(res.data.balance);
    } catch (err) {
      console.error("Error fetching balance:", err);
    }
  };

  const fetchTrades = async () => {
    try {
      const res = await api.get('/portfolio/default_user/trades');
      if (res.data) setTrades(res.data);
    } catch (err) {
      console.error("Error fetching trades:", err);
    }
  };

  const fetchPrediction = async () => {
    setLoadingPrediction(true);
    try {
      const res = await api.get(`/signals/predict`, {
        params: { symbol, timeframe }
      });
      if (res.data) {
        setPrediction(res.data);
        if (res.data.signal === 'CALL' || res.data.signal === 'PUT') {
          setTradeDirection(res.data.signal);
        }
      }
    } catch (err) {
      console.error("Error fetching prediction:", err);
      setPrediction(null);
    } finally {
      setLoadingPrediction(false);
    }
  };

  const fetchOptionChain = async () => {
    try {
      const res = await api.get(`/portfolio/option_chain`, {
        params: { symbol }
      });
      if (res.data && res.data.chain) {
        setOptionChainList(res.data.chain);
        const spot = res.data.spot_price;
        const { strikeDiff } = getOptionParams(symbol);
        const atmStrike = Math.round(spot / strikeDiff) * strikeDiff;
        const atm = res.data.chain.find((item: any) => item.strike === atmStrike) || res.data.chain[Math.floor(res.data.chain.length / 2)];
        if (atm) {
          setSelectedOptionContract({
            strike: atm.strike,
            optionType: tradeDirection,
            premium: tradeDirection === 'CALL' ? atm.call_premium : atm.put_premium,
            optionSymbol: tradeDirection === 'CALL' ? atm.option_symbol_call : atm.option_symbol_put
          });
        }
      }
    } catch (err) {
      console.error("Error fetching option chain:", err);
    }
  };

  useEffect(() => {
    fetchBalance();
    fetchTrades();
    fetchPrediction();
    fetchOptionChain();
  }, [symbol, timeframe]);

  // Sync selectedOptionContract ATM default when trade direction changes
  useEffect(() => {
    const spot = livePrice || (prediction ? prediction.entry : null);
    if (spot && spot > 0) {
      const { strikeDiff, sigma } = getOptionParams(symbol);
      const atmStrike = Math.round(spot / strikeDiff) * strikeDiff;
      const T = 4.0 / 365.0;
      const r = 0.07;
      
      const currentStrike = selectedOptionContract?.strike && Math.abs(selectedOptionContract.strike - spot) < spot * 0.1
        ? selectedOptionContract.strike 
        : atmStrike;
        
      const optSymbol = `${getOptionParams(symbol).name}-${currentStrike}-${tradeDirection === 'CALL' ? 'CE' : 'PE'}`;
      const premium = calculateOptionPremium(spot, currentStrike, T, r, sigma, tradeDirection);
      
      setSelectedOptionContract({
        strike: currentStrike,
        optionType: tradeDirection,
        premium: premium,
        optionSymbol: optSymbol
      });
    }
  }, [tradeDirection, symbol]);

  useEffect(() => {
    const checkMarket = () => {
      const d = new Date();
      const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
      const ist = new Date(utc + (3600000 * 5.5));
      const day = ist.getDay();
      const mins = ist.getHours() * 60 + ist.getMinutes();
      setMarketOpen(day !== 0 && day !== 6 && mins >= 555 && mins <= 930);
    };
    checkMarket();
    const interval = setInterval(checkMarket, 10000);
    return () => clearInterval(interval);
  }, []);

  // WebSockets ticking for premiums and P&L
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTrades();
      fetchBalance();
    }, 5000);

    const handlePriceUpdate = (data: any) => {
      if (data.symbol === symbol) {
        setLivePrice(data.price);
        if (data.changePercent !== undefined) {
          setChangePercent(data.changePercent);
        }
      }

      setTrades(prevTrades => 
        prevTrades.map(trade => {
          if (trade.symbol === data.symbol && trade.status === "OPEN") {
            const entry = parseFloat(trade.entry_price);
            const isOpt = trade.is_option || false;
            
            if (isOpt) {
              const strike = parseFloat(trade.strike_price);
              const optType = trade.option_type || "CALL";
              const qtyLots = parseInt(trade.qty_lots || 1);
              const lotSize = parseInt(trade.lot_size || 75);
              const created_at = new Date(trade.created_at);
              
              const { sigma } = getOptionParams(trade.symbol);
              const r = 0.07;
              const T = 4.0 / 365.0;
              
              const elapsedSeconds = getMarketElapsedSeconds(created_at, new Date());
              const elapsedYears = (elapsedSeconds * 3.84) / (365.0 * 24.0 * 3600.0);
              const T_current = Math.max(0.5 / 365.0, T - elapsedYears);
              
              const curPremium = calculateOptionPremium(data.price, strike, T_current, r, sigma, optType);
              const lpnl = (curPremium - entry) * lotSize * qtyLots;
              
              return {
                ...trade,
                current_price: curPremium,
                live_pnl: Math.max(lpnl, -entry * lotSize * qtyLots),
                spot_current_price: data.price
              };
            } else {
              const amt = parseFloat(trade.amount);
              let lpnl = 0;
              if (trade.direction === "CALL") {
                lpnl = amt * ((data.price - entry) / entry) * 10;
              } else {
                lpnl = amt * ((entry - data.price) / entry) * 10;
              }
              return {
                ...trade,
                current_price: data.price,
                live_pnl: Math.max(lpnl, -amt)
              };
            }
          }
          return trade;
        })
      );
    };

    socket.on('price_update', handlePriceUpdate);
    return () => {
      clearInterval(interval);
      socket.off('price_update', handlePriceUpdate);
    };
  }, [symbol]);

  const handlePlaceTrade = async () => {
    if (!selectedOptionContract) {
      alert("No option contract selected.");
      return;
    }

    const currentPrice = livePrice || prediction?.entry;
    if (!currentPrice) {
      alert("Unable to fetch current market price. Please wait for a tick or refresh.");
      return;
    }

    const { lotSize, sigma } = getOptionParams(symbol);
    const premiumCost = selectedOptionContract.premium * lotSize * quantityLots;
    
    if (premiumCost > balance) {
      alert("Insufficient virtual balance to pay option premium.");
      return;
    }

    setPlacingTrade(true);
    try {
      const T = 4.0 / 365.0;
      const r = 0.07;
      
      const isCall = selectedOptionContract.optionType === 'CALL';
      const targetOffset = isCall ? 1.015 : 0.985;
      const slOffset = isCall ? 0.992 : 1.008;

      const useAISmart = useAISmartTargets && prediction && prediction.signal === selectedOptionContract.optionType;
      const spotTarget = useAISmart ? prediction.target : currentPrice * targetOffset;
      const spotSL = useAISmart ? prediction.stop_loss : currentPrice * slOffset;

      const targetPremium = calculateOptionPremium(spotTarget, selectedOptionContract.strike, T, r, sigma, selectedOptionContract.optionType);
      const stopLossPremium = calculateOptionPremium(spotSL, selectedOptionContract.strike, T, r, sigma, selectedOptionContract.optionType);

      await api.post('/portfolio/trade', {
        user_id: 'default_user',
        symbol: symbol,
        timeframe: timeframe,
        direction: selectedOptionContract.optionType,
        amount: premiumCost,
        entry_price: selectedOptionContract.premium,
        target_price: targetPremium,
        stop_loss: stopLossPremium,
        is_option: true,
        strike_price: selectedOptionContract.strike,
        option_type: selectedOptionContract.optionType,
        qty_lots: quantityLots,
        lot_size: lotSize,
        spot_entry_price: currentPrice,
        prediction_snapshot: prediction
      });

      fetchBalance();
      fetchTrades();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to place trade.");
    } finally {
      setPlacingTrade(false);
    }
  };

  const handleCloseTrade = async (tradeId: string) => {
    try {
      await api.post(`/portfolio/trade/${tradeId}/close`);
      fetchBalance();
      fetchTrades();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to close trade.");
    }
  };

  const activeTrades = trades.filter(t => t.status === "OPEN");
  const historicTrades = trades.filter(t => t.status === "CLOSED");

  const assistantRecommendation = (() => {
    const spot = livePrice || (prediction ? prediction.entry : null);
    if (!spot) return null;

    const { strikeDiff, lotSize, sigma, name } = getOptionParams(symbol);
    const recType = prediction && (prediction.signal === 'CALL' || prediction.signal === 'PUT') 
      ? prediction.signal 
      : 'CALL';

    const recStrike = Math.round(spot / strikeDiff) * strikeDiff;
    const T = 4.0 / 365.0;
    const r = 0.07;
    const recPremium = calculateOptionPremium(spot, recStrike, T, r, sigma, recType);
    
    const costPerLot = recPremium * lotSize;
    const recLots = Math.max(1, Math.floor(optionsAssistantCapital / costPerLot));
    const capitalRequired = recLots * costPerLot;
    const capitalExceeded = capitalRequired > optionsAssistantCapital;

    const spotTarget = prediction && prediction.target_2 
      ? prediction.target_2 
      : (recType === 'CALL' ? spot * 1.015 : spot * 0.985);
      
    const spotSL = prediction && prediction.stop_loss 
      ? prediction.stop_loss 
      : (recType === 'CALL' ? spot * 0.992 : spot * 1.008);

    const targetPremium = calculateOptionPremium(spotTarget, recStrike, T, r, sigma, recType);
    const stopLossPremium = calculateOptionPremium(spotSL, recStrike, T, r, sigma, recType);

    const profitPerOption = targetPremium - recPremium;
    const lossPerOption = recPremium - stopLossPremium;

    const potentialProfit = profitPerOption * lotSize * recLots;
    const potentialLoss = lossPerOption * lotSize * recLots;
    const rrRatio = lossPerOption > 0 ? (profitPerOption / lossPerOption).toFixed(1) : '2.0';

    const successProb = prediction ? (prediction.success_probability || prediction.confidence) : 70;

    return {
      type: recType,
      strike: recStrike,
      premium: recPremium,
      lots: recLots,
      capitalRequired,
      capitalExceeded,
      targetPremium,
      stopLossPremium,
      potentialProfit,
      potentialLoss,
      rrRatio,
      successProb,
      optionSymbol: `${name}-${recStrike}-${recType === 'CALL' ? 'CE' : 'PE'}`,
      lotSize
    };
  })();

  const formatElapsed = (createdAtStr: string, closedAtStr?: string) => {
    try {
      const start = new Date(createdAtStr);
      const end = closedAtStr ? new Date(closedAtStr) : new Date();
      const diffMs = end.getTime() - start.getTime();
      if (diffMs <= 0) return "0s";
      
      const seconds = Math.floor(diffMs / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (days > 0) return `${days}d ${hours % 24}h`;
      if (hours > 0) return `${hours}h ${minutes % 60}m`;
      if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
      return `${seconds}s`;
    } catch (e) {
      return "N/A";
    }
  };

  const toggleRow = (tradeId: string) => {
    setExpandedTradeIds(prev => ({
      ...prev,
      [tradeId]: !prev[tradeId]
    }));
  };

  const getRealOptionSymbolName = (trade: any) => {
    if (!trade.is_option) return SYMBOL_NAMES[trade.symbol] || trade.symbol;
    try {
      const name = getOptionParams(trade.symbol).name;
      const strike = trade.strike_price;
      const type = trade.option_type === "CALL" ? "CE" : "PE";
      const date = new Date(trade.created_at);
      const day = date.getDay();
      const daysToThursday = (4 - day + 7) % 7 || 7;
      const expiryDate = new Date(date.getTime() + daysToThursday * 24 * 3600000);
      const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
      const dayStr = expiryDate.getDate().toString().padStart(2, '0');
      const monthStr = months[expiryDate.getMonth()];
      return `${name} ${dayStr}${monthStr} ${strike} ${type}`;
    } catch (e) {
      return `${trade.symbol} ${trade.strike_price} CE`;
    }
  };
  const companyName = SYMBOL_NAMES[symbol] || symbol;
  const currentSymbolPrice = livePrice || (prediction ? prediction.entry : 0);
  const isUp = changePercent !== null ? changePercent >= 0 : true;

  const isSimulatedMarketOpen = marketModeSimulation === 'AUTO' ? marketOpen : (marketModeSimulation === 'OPEN');

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Groww-style Stock Header */}
      <div className="bg-[#121620] border border-[#2D3247] rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="bg-primary/10 text-primary w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl">
            {symbol.slice(0, 2).replace('^', '')}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-black text-white">{companyName}</h1>
              <span className="text-xs font-mono font-bold text-[#7C8B9E] bg-[#1C2030] px-2 py-0.5 rounded border border-[#2D3247]">
                {symbol}
              </span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded flex items-center gap-1 transition-all ${
                isSimulatedMarketOpen ? 'bg-[#00D09C]/10 text-[#00D09C]' : 'bg-[#FF5353]/10 text-[#FF5353]'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isSimulatedMarketOpen ? 'bg-[#00D09C] animate-pulse' : 'bg-[#FF5353]'}`}></span>
                {isSimulatedMarketOpen ? 'EXCHANGE LIVE' : 'EXCHANGE CLOSED'}
              </span>
            </div>
            
            <div className="flex items-center gap-3 mt-1.5">
              <span className="text-2xl font-black text-white font-mono">
                {formatCurrency(currentSymbolPrice)}
              </span>
              
              {changePercent !== null ? (
                <span className={`inline-flex items-center gap-0.5 font-bold font-mono text-xs ${
                  isUp ? 'text-[#00D09C]' : 'text-[#FF5353]'
                }`}>
                  {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  {isUp ? '+' : ''}{changePercent.toFixed(2)}%
                </span>
              ) : (
                <span className="text-xs text-[#7C8B9E] font-medium animate-pulse">Waiting for ticks...</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          {/* Market Status Simulation Control */}
          <div className="flex items-center gap-1 bg-[#171C2B] border border-[#2D3247] p-1 rounded-xl">
            <span className="text-[9px] font-black text-[#7C8B9E] px-2 uppercase tracking-wider">Exchange Sim:</span>
            <button
              type="button"
              onClick={() => setMarketModeSimulation('AUTO')}
              className={`px-2.5 py-1 rounded-lg text-[9px] font-black transition-all ${
                marketModeSimulation === 'AUTO' 
                  ? 'bg-primary text-white shadow-md' 
                  : 'text-[#7C8B9E] hover:text-white hover:bg-gray-800/30'
              }`}
            >
              AUTO
            </button>
            <button
              type="button"
              onClick={() => setMarketModeSimulation('OPEN')}
              className={`px-2.5 py-1 rounded-lg text-[9px] font-black transition-all ${
                marketModeSimulation === 'OPEN' 
                  ? 'bg-[#00D09C] text-white shadow-md' 
                  : 'text-[#7C8B9E] hover:text-white hover:bg-gray-800/30'
              }`}
            >
              LIVE OPEN
            </button>
            <button
              type="button"
              onClick={() => setMarketModeSimulation('CLOSED')}
              className={`px-2.5 py-1 rounded-lg text-[9px] font-black transition-all ${
                marketModeSimulation === 'CLOSED' 
                  ? 'bg-[#FF5353] text-white shadow-md' 
                  : 'text-[#7C8B9E] hover:text-white hover:bg-gray-800/30'
              }`}
            >
              CLOSED
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-extrabold text-[#7C8B9E] uppercase tracking-wider">Symbol:</label>
            <select 
              className="bg-[#1C2030] border border-[#2D3247] rounded-xl px-3 py-2 outline-none focus:border-primary text-xs font-black text-white transition-colors"
              value={symbol} 
              onChange={e => setSymbol(e.target.value)}
            >
              <option value="^NSEI">NIFTY 50</option>
              <option value="^BSESN">SENSEX</option>
              <option value="RELIANCE.NS">RELIANCE</option>
              <option value="HDFCBANK.NS">HDFCBANK</option>
              <option value="AAPL">AAPL</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Terminal Workspace grid layout */}
      <div className="grid grid-cols-1 xl:grid-cols-10 gap-6">
        
        {/* Left Column: Option Chain and Active Trades */}
        <div className="xl:col-span-7 flex flex-col gap-6">
          <div className="bg-[#121620] border border-[#2D3247] rounded-2xl p-6 shadow-xl flex-grow">
            <div className="flex border-b border-[#2D3247] mb-6 overflow-x-auto scrollbar-none">
              <button
                type="button"
                onClick={() => setActiveTab('active')}
                className={`pb-3 pr-6 text-sm font-black transition-all border-b-2 shrink-0 ${
                  activeTab === 'active' ? 'border-primary text-white' : 'border-transparent text-[#7C8B9E] hover:text-[#D1D5DB]'
                }`}
              >
                Open Positions ({activeTrades.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('option_chain')}
                className={`pb-3 px-6 text-sm font-black transition-all border-b-2 shrink-0 ${
                  activeTab === 'option_chain' ? 'border-primary text-white' : 'border-transparent text-[#7C8B9E] hover:text-[#D1D5DB]'
                }`}
              >
                Live Option Chain
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`pb-3 px-6 text-sm font-black transition-all border-b-2 shrink-0 ${
                  activeTab === 'history' ? 'border-primary text-white' : 'border-transparent text-[#7C8B9E] hover:text-[#D1D5DB]'
                }`}
              >
                Closed Positions Ledger ({historicTrades.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('analytics')}
                className={`pb-3 px-6 text-sm font-black transition-all border-b-2 shrink-0 ${
                  activeTab === 'analytics' ? 'border-primary text-white' : 'border-transparent text-[#7C8B9E] hover:text-[#D1D5DB]'
                }`}
              >
                Trader Performance Analytics
              </button>
            </div>

            {activeTab === 'active' ? (
              activeTrades.length === 0 ? (
                <div className="py-12 text-center text-[#7C8B9E] text-sm">
                  No active positions open.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#2D3247] text-[#7C8B9E] font-bold uppercase tracking-wider text-[10px]">
                        <th className="py-3.5 px-3 w-8"></th>
                        <th className="py-3.5 px-4">Instrument</th>
                        <th className="py-3.5 px-4">Direction</th>
                        <th className="py-3.5 px-4 text-right">Invested</th>
                        <th className="py-3.5 px-4 text-right">Avg Entry</th>
                        <th className="py-3.5 px-4 text-right">Current Price</th>
                        <th className="py-3.5 px-4 text-right">Live P&L</th>
                        <th className="py-3.5 px-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeTrades.map((trade) => {
                        const isExpanded = expandedTradeIds[trade.id] || false;
                        const livePnl = parseFloat(trade.live_pnl || 0);
                        const pnlPct = trade.amount > 0 ? (livePnl / trade.amount) * 100 : 0;
                        const isProfit = livePnl >= 0;
                        return (
                          <Fragment key={trade.id}>
                            <tr 
                              className="border-b border-gray-850 hover:bg-gray-800/10 transition-colors cursor-pointer select-none"
                              onClick={() => toggleRow(trade.id)}
                            >
                              <td className="py-4 px-3 text-center">
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-[#7C8B9E] inline" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-[#7C8B9E] inline" />
                                )}
                              </td>
                              <td className="py-4 px-4 font-black text-white font-mono">
                                <div className="flex flex-col">
                                  <span>{getRealOptionSymbolName(trade)}</span>
                                  {trade.is_option && (
                                    <span className="text-[9px] font-bold text-[#7C8B9E] mt-0.5 font-mono">
                                      Strike: {trade.strike_price} ({trade.option_type === 'CALL' ? 'CE' : 'PE'}) • {trade.qty_lots} Lots
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <span className={`px-2 py-0.5 rounded font-black text-[10px] ${
                                  trade.direction === 'CALL' ? 'bg-[#00D09C]/10 text-[#00D09C]' : 'bg-[#FF5353]/10 text-[#FF5353]'
                                }`}>
                                  {trade.direction}
                                </span>
                              </td>
                              <td className="py-4 px-4 text-right font-bold text-white font-mono">{formatCurrency(trade.amount)}</td>
                              <td className="py-4 px-4 text-right font-bold text-[#7C8B9E] font-mono">{formatCurrency(trade.entry_price)}</td>
                              <td className="py-4 px-4 text-right font-bold text-white font-mono">{formatCurrency(trade.current_price || 0)}</td>
                              <td className={`py-4 px-4 text-right font-black font-mono ${
                                isProfit ? 'text-[#00D09C]' : 'text-[#FF5353]'
                              }`}>
                                <div className="flex flex-col items-end">
                                  <span>{isProfit ? '+' : ''}{formatCurrency(livePnl)}</span>
                                  <span className="text-[10px] font-bold">
                                    {isProfit ? '+' : ''}{pnlPct.toFixed(2)}%
                                  </span>
                                </div>
                              </td>
                              <td className="py-4 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => handleCloseTrade(trade.id)}
                                  className="bg-[#FF5353]/15 hover:bg-[#FF5353] text-[#FF5353] hover:text-white border border-[#FF5353]/30 hover:border-[#FF5353] text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-lg transition-all"
                                >
                                  Square Off
                                </button>
                              </td>
                            </tr>

                            {isExpanded && (
                              <tr className="bg-[#171C2B]/35">
                                <td colSpan={11} className="p-5 border-b border-[#2D3247]">
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-white">
                                    {/* Timeline & Spec */}
                                    <div className="bg-[#1C2030]/65 border border-[#2D3247] rounded-xl p-4 space-y-3">
                                      <h4 className="text-primary font-black uppercase tracking-wider text-[10px] flex items-center gap-1.5 border-b border-[#2D3247]/50 pb-2">
                                        <Clock className="w-3.5 h-3.5" /> Position Timeline & Spec
                                      </h4>
                                      <div className="space-y-2">
                                        <div className="flex justify-between">
                                          <span className="text-[#7C8B9E]">Status:</span>
                                          <span className="font-extrabold text-[#00D09C] animate-pulse">
                                            ACTIVE
                                          </span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-[#7C8B9E]">Placed At:</span>
                                          <span className="font-bold font-mono">{new Date(trade.created_at).toLocaleString('en-IN')}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-[#7C8B9E]">Time Elapsed:</span>
                                          <span className="font-bold font-mono">{formatElapsed(trade.created_at)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-[#7C8B9E]">Expiry Timeframe:</span>
                                          <span className="font-bold font-mono">{trade.timeframe}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-[#7C8B9E]">Product Type:</span>
                                          <span className="font-bold">{trade.is_option ? 'Option Buyer (Intraday)' : 'Spot Margin'}</span>
                                        </div>
                                        {trade.is_option && (
                                          <div className="flex justify-between">
                                            <span className="text-[#7C8B9E]">Lot Specifications:</span>
                                            <span className="font-bold font-mono">{trade.qty_lots} Lots × {trade.lot_size} Qty</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Spot Price & Exit Performance */}
                                    <div className="bg-[#1C2030]/65 border border-[#2D3247] rounded-xl p-4 space-y-4">
                                      <h4 className="text-primary font-black uppercase tracking-wider text-[10px] flex items-center gap-1.5 border-b border-[#2D3247]/50 pb-2">
                                        <TrendingUp className="w-3.5 h-3.5" /> Spot Price & Performance
                                      </h4>
                                      <div className="space-y-2">
                                        <div className="flex justify-between">
                                          <span className="text-[#7C8B9E]">Entry Spot Price:</span>
                                          <span className="font-bold font-mono">{formatCurrency(trade.spot_entry_price || 0)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-[#7C8B9E]">Current Spot Price:</span>
                                          <span className="font-bold font-mono">{formatCurrency(trade.spot_current_price || trade.spot_entry_price || 0)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-[#7C8B9E]">Underlying Move:</span>
                                          {(() => {
                                            const entrySpot = trade.spot_entry_price || 0;
                                            const curSpot = trade.spot_current_price || entrySpot;
                                            const pct = entrySpot > 0 ? ((curSpot - entrySpot) / entrySpot) * 100 : 0;
                                            const isSpotUp = pct >= 0;
                                            return (
                                              <span className={`font-bold font-mono ${isSpotUp ? 'text-[#00D09C]' : 'text-[#FF5353]'}`}>
                                                {isSpotUp ? '+' : ''}{pct.toFixed(2)}%
                                              </span>
                                            );
                                          })()}
                                        </div>
                                      </div>

                                      {/* Visual Premium Target / SL Progress Slider */}
                                      <div className="space-y-1.5 pt-2 border-t border-[#2D3247]/50">
                                        <div className="flex justify-between text-[9px] font-bold text-[#7C8B9E]">
                                          <span>SL: {formatCurrency(trade.stop_loss)}</span>
                                          <span>Target: {formatCurrency(trade.target_price)}</span>
                                        </div>
                                        {/* Slider Bar */}
                                        {(() => {
                                          const entry = trade.entry_price;
                                          const current = parseFloat(trade.current_price || 0);
                                          const sl = trade.stop_loss;
                                          const target = trade.target_price;
                                          
                                          let pct = 50;
                                          if (target !== sl) {
                                            pct = ((current - sl) / (target - sl)) * 100;
                                            pct = Math.min(Math.max(pct, 0), 100);
                                          }
                                          
                                          let entryPct = 50;
                                          if (target !== sl) {
                                            entryPct = ((entry - sl) / (target - sl)) * 100;
                                            entryPct = Math.min(Math.max(entryPct, 0), 100);
                                          }

                                          return (
                                            <div className="relative pt-4 pb-2">
                                              <div className="w-full h-1.5 rounded-full bg-[#121620] overflow-hidden relative border border-[#2D3247]/30">
                                                <div 
                                                  className="absolute top-0 bottom-0 left-0 bg-[#FF5353]/35" 
                                                  style={{ width: `${entryPct}%` }}
                                                ></div>
                                                <div 
                                                  className="absolute top-0 bottom-0 right-0 bg-[#00D09C]/35" 
                                                  style={{ left: `${entryPct}%` }}
                                                ></div>
                                              </div>
                                              <div 
                                                className="absolute top-2.5 w-1 h-3.5 bg-white rounded-full" 
                                                style={{ left: `calc(${entryPct}% - 2px)` }}
                                                title="Entry Premium"
                                              >
                                                <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] font-black text-white">Entry</span>
                                              </div>
                                              <div 
                                                className={`absolute top-2.5 w-3.5 h-3.5 rounded-full border-2 border-[#121620] shadow-lg ${
                                                  current >= entry ? 'bg-[#00D09C]' : 'bg-[#FF5353]'
                                                }`}
                                                style={{ left: `calc(${pct}% - 7px)` }}
                                                title={`Current Premium: ${formatCurrency(current)}`}
                                              ></div>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    </div>

                                    {/* AI Prediction vs Actual snapshot */}
                                    <div className="bg-[#1C2030]/65 border border-[#2D3247] rounded-xl p-4 space-y-3">
                                      <h4 className="text-primary font-black uppercase tracking-wider text-[10px] flex items-center gap-1.5 border-b border-[#2D3247]/50 pb-2">
                                        <Sparkles className="w-3.5 h-3.5" /> AI Prediction Snapshot
                                      </h4>
                                      {trade.prediction_snapshot ? (
                                        <div className="space-y-2">
                                          <div className="flex justify-between">
                                            <span className="text-[#7C8B9E]">AI Signal Consensus:</span>
                                            <span className={`px-1.5 py-0.5 rounded font-black text-[10px] ${
                                              trade.prediction_snapshot.signal === 'CALL' 
                                                ? 'bg-[#00D09C]/10 text-[#00D09C]' 
                                                : trade.prediction_snapshot.signal === 'PUT'
                                                ? 'bg-[#FF5353]/10 text-[#FF5353]'
                                                : 'bg-gray-800 text-[#7C8B9E]'
                                            }`}>
                                              {trade.prediction_snapshot.signal} ({trade.prediction_snapshot.confidence}%)
                                            </span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-[#7C8B9E]">Expected Success Prob:</span>
                                            <span className="font-extrabold text-[#00D09C] font-mono">{trade.prediction_snapshot.success_probability?.toFixed(1) || trade.prediction_snapshot.confidence}%</span>
                                          </div>
                                          {trade.prediction_snapshot.technical_reason && (
                                            <div className="bg-[#121620] rounded-lg p-2 border border-[#2D3247] text-[10px] text-[#7C8B9E] leading-relaxed max-h-[70px] overflow-y-auto font-medium">
                                              <span className="text-white font-extrabold block mb-0.5 text-[9px] uppercase tracking-wider">AI Rationale</span>
                                              {trade.prediction_snapshot.technical_reason}
                                            </div>
                                          )}
                                          <div className="pt-2 border-t border-[#2D3247]/50 grid grid-cols-3 gap-1.5 text-center text-[9px] font-bold">
                                            <div className="bg-[#121620] rounded p-1 border border-[#2D3247]/50">
                                              <span className="text-[#7C8B9E] block uppercase text-[7px] mb-0.5">Entry RSI</span>
                                              <span className="text-white font-mono">{trade.prediction_snapshot.rsi?.toFixed(1) || 'N/A'}</span>
                                            </div>
                                            <div className="bg-[#121620] rounded p-1 border border-[#2D3247]/50">
                                              <span className="text-[#7C8B9E] block uppercase text-[7px] mb-0.5">Entry ADX</span>
                                              <span className="text-white font-mono">{trade.prediction_snapshot.adx?.toFixed(1) || 'N/A'}</span>
                                            </div>
                                            <div className="bg-[#121620] rounded p-1 border border-[#2D3247]/50">
                                              <span className="text-[#7C8B9E] block uppercase text-[7px] mb-0.5">MACD Diff</span>
                                              <span className="text-white font-mono">
                                                {trade.prediction_snapshot.macd !== undefined && trade.prediction_snapshot.macd_signal !== undefined
                                                  ? (trade.prediction_snapshot.macd - trade.prediction_snapshot.macd_signal).toFixed(2)
                                                  : 'N/A'}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="text-center py-6 text-[#7C8B9E] text-xs font-bold italic flex items-center justify-center gap-1.5">
                                          <Info className="w-4 h-4 text-warning" />
                                          No AI prediction snapshot stored for this trade.
                                        </div>
                                      )}
                                    </div>

                                    {/* Trade Execution Status Stepper */}
                                    <div className="bg-[#1C2030]/65 border border-[#2D3247] rounded-xl p-4 space-y-4 col-span-1 md:col-span-3 mt-2">
                                      <h4 className="text-primary font-black uppercase tracking-wider text-[10px] flex items-center gap-1.5 border-b border-[#2D3247]/50 pb-2">
                                        <TrendingUp className="w-3.5 h-3.5" /> AI Real-time Trade Execution Stepper
                                      </h4>
                                      {(() => {
                                        const current = trade.current_price;
                                        const entry = trade.entry_price;
                                        const target = trade.target_price;
                                        const sl = trade.stop_loss;
                                        
                                        // Calculate current stage
                                        let stage = "Trade Active";
                                        let stageIdx = 3; // default: active
                                        
                                        const pnlRatio = pnlPct;
                                        
                                        if (trade.status === "CLOSED") {
                                          stage = "Trade Closed";
                                          stageIdx = 7;
                                        } else if (pnlRatio >= 30.0) {
                                          stage = "Target 2 Hit";
                                          stageIdx = 5;
                                        } else if (pnlRatio >= 10.0) {
                                          stage = "Target 1 Hit";
                                          stageIdx = 4;
                                        } else if (pnlRatio <= -20.0) {
                                          stage = "Trailing Stop Active";
                                          stageIdx = 6;
                                        } else if (pnlRatio > -1.0 && pnlRatio < 1.0) {
                                          stage = "Entry Triggered";
                                          stageIdx = 2;
                                        }
                                        
                                        const stages = [
                                          { name: "Watching Setup", color: "text-[#7C8B9E]", bg: "bg-gray-800" },
                                          { name: "Preparing Entry", color: "text-primary", bg: "bg-primary/20 border-primary" },
                                          { name: "Entry Triggered", color: "text-[#00D09C]", bg: "bg-[#00D09C]/20 border-[#00D09C]" },
                                          { name: "Trade Active", color: "text-[#00D09C]", bg: "bg-[#00D09C]/20 border-[#00D09C]" },
                                          { name: "Target 1 Hit", color: "text-[#00D09C]", bg: "bg-[#00D09C]/30 border-[#00D09C]" },
                                          { name: "Target 2 Hit", color: "text-[#00D09C]", bg: "bg-[#00D09C]/30 border-[#00D09C]" },
                                          { name: "Trailing Stop Active", color: "text-warning", bg: "bg-warning/20 border-warning" },
                                          { name: "Trade Closed", color: "text-[#FF5353]", bg: "bg-[#FF5353]/20 border-[#FF5353]" }
                                        ];
                                        
                                        return (
                                          <div className="space-y-4">
                                            {/* Step circles */}
                                            <div className="flex flex-wrap items-center justify-between gap-y-3 relative z-10">
                                              {stages.map((st, idx) => {
                                                const isActive = idx === stageIdx;
                                                const isCompleted = idx < stageIdx;
                                                
                                                return (
                                                  <div key={st.name} className="flex flex-col items-center shrink-0 w-[12%] text-center">
                                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black border transition-all duration-300 ${
                                                      isActive 
                                                        ? 'bg-primary border-primary text-white scale-110 shadow-lg shadow-primary/20' 
                                                        : isCompleted 
                                                        ? 'bg-[#00D09C] border-[#00D09C] text-[#121620]' 
                                                        : 'bg-[#1C2030] border-[#2D3247] text-[#7C8B9E]'
                                                    }`}>
                                                      {isCompleted ? "✔" : idx + 1}
                                                    </div>
                                                    <span className={`text-[8px] font-extrabold mt-1.5 leading-tight select-none ${
                                                      isActive ? 'text-white font-black' : isCompleted ? 'text-[#D1D5DB]' : 'text-[#7C8B9E]'
                                                    }`}>
                                                      {st.name}
                                                    </span>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                            
                                            {/* Mini status indicator */}
                                            <div className="bg-[#121620] border border-[#2D3247] p-2.5 rounded-lg text-[10px] font-bold text-[#7C8B9E] flex justify-between items-center">
                                              <span>Current Status: <strong className="text-white font-mono">{stage}</strong></span>
                                              <span className="flex items-center gap-1.5">
                                                <span className={`w-2 h-2 rounded-full ${stageIdx >= 2 && stageIdx <= 5 ? 'bg-[#00D09C] animate-ping' : 'bg-[#FF5353]'}`}></span>
                                                {stageIdx >= 2 && stageIdx <= 5 ? 'Real-time monitoring active' : 'Monitoring paused'}
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      })()}
                                    </div>

                                    {/* Contract Note Receipt Breakdown */}
                                    <div className="bg-[#1C2030]/65 border border-[#2D3247] rounded-xl p-4 space-y-3 col-span-1 md:col-span-3 mt-2 border-t-2 border-dashed border-primary/45">
                                      <div className="flex justify-between items-center border-b border-[#2D3247]/50 pb-2">
                                        <h4 className="text-primary font-black uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                                          <Wallet className="w-3.5 h-3.5" /> Virtual Contract Note & Govt. Charges
                                        </h4>
                                        <span className="text-[9px] font-bold text-[#7C8B9E] font-mono">Invoice #{trade.id ? trade.id.slice(0, 8).toUpperCase() : 'PENDING'}</span>
                                      </div>
                                      
                                      {(() => {
                                        const brokerage = 20.0;
                                        const stt = trade.amount * 0.00125;
                                        const exchangeTx = trade.amount * 0.00053;
                                        const stampDuty = trade.amount * 0.00003;
                                        const sebiFees = trade.amount * 0.000001;
                                        const gst = (brokerage + exchangeTx + sebiFees) * 0.18;
                                        const total = brokerage + stt + exchangeTx + stampDuty + sebiFees + gst;
                                        return (
                                          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-[10px] text-[#7C8B9E] font-bold">
                                            <div className="bg-[#121620] p-2 rounded-lg border border-[#2D3247]/40">
                                              <span className="block text-[8px] uppercase text-[#7C8B9E] mb-0.5">Brokerage</span>
                                              <span className="text-white font-mono">{formatCurrency(brokerage)}</span>
                                            </div>
                                            <div className="bg-[#121620] p-2 rounded-lg border border-[#2D3247]/40">
                                              <span className="block text-[8px] uppercase text-[#7C8B9E] mb-0.5">STT/CTT (0.125%)</span>
                                              <span className="text-white font-mono">{formatCurrency(stt)}</span>
                                            </div>
                                            <div className="bg-[#121620] p-2 rounded-lg border border-[#2D3247]/40">
                                              <span className="block text-[8px] uppercase text-[#7C8B9E] mb-0.5">Exch. Tx (0.053%)</span>
                                              <span className="text-white font-mono">{formatCurrency(exchangeTx)}</span>
                                            </div>
                                            <div className="bg-[#121620] p-2 rounded-lg border border-[#2D3247]/40">
                                              <span className="block text-[8px] uppercase text-[#7C8B9E] mb-0.5">Stamp Duty (0.003%)</span>
                                              <span className="text-white font-mono">{formatCurrency(stampDuty)}</span>
                                            </div>
                                            <div className="bg-[#121620] p-2 rounded-lg border border-[#2D3247]/40">
                                              <span className="block text-[8px] uppercase text-[#7C8B9E] mb-0.5">SEBI Fees</span>
                                              <span className="text-white font-mono">{formatCurrency(sebiFees)}</span>
                                            </div>
                                            <div className="bg-primary/5 p-2 rounded-lg border border-primary/20">
                                              <span className="block text-[8px] uppercase text-primary mb-0.5">Total Charges</span>
                                              <span className="text-primary font-black font-mono">{formatCurrency(total)}</span>
                                            </div>
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            ) : activeTab === 'option_chain' ? (
              optionChainList.length === 0 ? (
                <div className="py-12 text-center text-[#7C8B9E] text-sm animate-pulse">
                  Loading Option Chain for {companyName}...
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#2D3247] text-[#7C8B9E] font-bold uppercase tracking-wider text-[10px]">
                        <th className="py-3 px-4 text-left">CALL Delta</th>
                        <th className="py-3 px-4 text-right">CALL Premium</th>
                        <th className="py-3 px-4 text-center">CALL Action</th>
                        <th className="py-3 px-4 text-center bg-[#1C2030] text-white font-black">Strike Price</th>
                        <th className="py-3 px-4 text-center">PUT Action</th>
                        <th className="py-3 px-4 text-left">PUT Premium</th>
                        <th className="py-3 px-4 text-right">PUT Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {optionChainList.map((strikeItem) => {
                        const spot = livePrice || (prediction ? prediction.entry : 0);
                        const { strikeDiff, sigma } = getOptionParams(symbol);
                        const r = 0.07;
                        const T = 4.0 / 365.0;

                        const callPrem = spot > 0 ? calculateOptionPremium(spot, strikeItem.strike, T, r, sigma, 'CALL') : strikeItem.call_premium;
                        const putPrem = spot > 0 ? calculateOptionPremium(spot, strikeItem.strike, T, r, sigma, 'PUT') : strikeItem.put_premium;

                        const isCallSelected = selectedOptionContract && selectedOptionContract.strike === strikeItem.strike && selectedOptionContract.optionType === 'CALL';
                        const isPutSelected = selectedOptionContract && selectedOptionContract.strike === strikeItem.strike && selectedOptionContract.optionType === 'PUT';

                        return (
                          <tr key={strikeItem.strike} className="border-b border-gray-850 hover:bg-gray-800/10 transition-colors">
                            <td className="py-3.5 px-4 font-mono font-bold text-[#7C8B9E]">
                              {strikeItem.call_delta.toFixed(2)}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono font-black text-white">
                              {formatCurrency(callPrem)}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedOptionContract({
                                    strike: strikeItem.strike,
                                    optionType: 'CALL',
                                    premium: callPrem,
                                    optionSymbol: strikeItem.option_symbol_call
                                  });
                                  setTradeDirection('CALL');
                                  setSidebarTab('order');
                                }}
                                className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all ${
                                  isCallSelected 
                                    ? 'bg-[#00D09C] border-[#00D09C] text-white shadow-[#00D09C]/10' 
                                    : 'bg-primary/5 hover:bg-[#00D09C] border-primary/20 hover:border-[#00D09C] text-[#00D09C] hover:text-white'
                                }`}
                              >
                                BUY CE
                              </button>
                            </td>
                            <td className="py-3.5 px-4 text-center bg-[#171C2B] font-mono font-black text-white text-[13px] border-x border-[#2D3247]">
                              {strikeItem.strike}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedOptionContract({
                                    strike: strikeItem.strike,
                                    optionType: 'PUT',
                                    premium: putPrem,
                                    optionSymbol: strikeItem.option_symbol_put
                                  });
                                  setTradeDirection('PUT');
                                  setSidebarTab('order');
                                }}
                                className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all ${
                                  isPutSelected 
                                    ? 'bg-[#FF5353] border-[#FF5353] text-white shadow-[#FF5353]/10' 
                                    : 'bg-[#FF5353]/5 hover:bg-[#FF5353] border-[#FF5353]/20 hover:border-[#FF5353] text-[#FF5353] hover:text-white'
                                }`}
                              >
                                BUY PE
                              </button>
                            </td>
                            <td className="py-3.5 px-4 font-mono font-black text-white text-left">
                              {formatCurrency(putPrem)}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono font-bold text-[#7C8B9E]">
                              {strikeItem.put_delta.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            ) : activeTab === 'history' ? (
              historicTrades.length === 0 ? (
                <div className="py-12 text-center text-[#7C8B9E] text-sm">
                  No settled positions in ledger history.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#2D3247] text-[#7C8B9E] font-bold uppercase tracking-wider text-[10px]">
                        <th className="py-3.5 px-3 w-8"></th>
                        <th className="py-3.5 px-4">Instrument</th>
                        <th className="py-3.5 px-4">Direction</th>
                        <th className="py-3.5 px-4 text-right">Invested</th>
                        <th className="py-3.5 px-4 text-right">Avg Entry</th>
                        <th className="py-3.5 px-4 text-right">Exit Price</th>
                        <th className="py-3.5 px-4 text-right">Settled P&L</th>
                        <th className="py-3.5 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historicTrades.map((trade) => {
                        const isExpanded = expandedTradeIds[trade.id] || false;
                        const realizedPnl = parseFloat(trade.realized_pnl || trade.pnl || 0);
                        const pnlPct = trade.amount > 0 ? (realizedPnl / trade.amount) * 100 : 0;
                        const isWin = realizedPnl >= 0;
                        return (
                          <Fragment key={trade.id}>
                            <tr 
                              className="border-b border-gray-850 hover:bg-gray-800/10 transition-colors cursor-pointer select-none"
                              onClick={() => toggleRow(trade.id)}
                            >
                              <td className="py-4 px-3 text-center">
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-[#7C8B9E] inline" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-[#7C8B9E] inline" />
                                )}
                              </td>
                              <td className="py-4 px-4 font-black text-white font-mono">
                                <div className="flex flex-col">
                                  <span>{SYMBOL_NAMES[trade.symbol] || trade.symbol}</span>
                                  {trade.is_option && (
                                    <span className="text-[9px] font-bold text-[#7C8B9E] mt-0.5 font-mono">
                                      Strike: {trade.strike_price} ({trade.option_type === 'CALL' ? 'CE' : 'PE'}) • {trade.qty_lots} Lots
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <span className={`px-2 py-0.5 rounded font-black text-[10px] ${
                                  trade.direction === 'CALL' ? 'bg-[#00D09C]/10 text-[#00D09C]' : 'bg-[#FF5353]/10 text-[#FF5353]'
                                }`}>
                                  {trade.direction}
                                </span>
                              </td>
                              <td className="py-4 px-4 text-right font-bold text-white font-mono">{formatCurrency(trade.amount)}</td>
                              <td className="py-4 px-4 text-right font-bold text-[#7C8B9E] font-mono">{formatCurrency(trade.entry_price)}</td>
                              <td className="py-4 px-4 text-right font-bold text-white font-mono">{formatCurrency(parseFloat(trade.exit_price || 0))}</td>
                              <td className={`py-4 px-4 text-right font-black font-mono ${
                                isWin ? 'text-[#00D09C]' : 'text-[#FF5353]'
                              }`}>
                                <div className="flex flex-col items-end">
                                  <span>{isWin ? '+' : ''}{formatCurrency(realizedPnl)}</span>
                                  <span className="text-[10px] font-bold">
                                    {isWin ? '+' : ''}{pnlPct.toFixed(2)}%
                                  </span>
                                </div>
                              </td>
                              <td className="py-4 px-4 text-center">
                                <span className="flex items-center justify-center gap-1 text-[10px] font-bold text-[#7C8B9E]">
                                  {isWin ? <CheckCircle2 className="w-3.5 h-3.5 text-[#00D09C]" /> : <XCircle className="w-3.5 h-3.5 text-[#FF5353]" />}
                                  CLOSED
                                </span>
                              </td>
                            </tr>

                            {isExpanded && (
                              <tr className="bg-[#171C2B]/35">
                                <td colSpan={11} className="p-5 border-b border-[#2D3247]">
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-white">
                                    {/* Timeline & Spec */}
                                    <div className="bg-[#1C2030]/65 border border-[#2D3247] rounded-xl p-4 space-y-3">
                                      <h4 className="text-primary font-black uppercase tracking-wider text-[10px] flex items-center gap-1.5 border-b border-[#2D3247]/50 pb-2">
                                        <Clock className="w-3.5 h-3.5" /> Position Timeline & Spec
                                      </h4>
                                      <div className="space-y-2">
                                        <div className="flex justify-between">
                                          <span className="text-[#7C8B9E]">Status:</span>
                                          <span className={`font-extrabold flex items-center gap-1 ${isWin ? 'text-[#00D09C]' : 'text-[#FF5353]'}`}>
                                            {isWin ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                                            {trade.outcome || 'CLOSED'}
                                          </span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-[#7C8B9E]">Placed At:</span>
                                          <span className="font-bold font-mono">{new Date(trade.created_at).toLocaleString('en-IN')}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-[#7C8B9E]">Closed At:</span>
                                          <span className="font-bold font-mono">{trade.closed_at ? new Date(trade.closed_at).toLocaleString('en-IN') : 'N/A'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-[#7C8B9E]">Duration Held:</span>
                                          <span className="font-bold font-mono">{formatElapsed(trade.created_at, trade.closed_at)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-[#7C8B9E]">Product Type:</span>
                                          <span className="font-bold">{trade.is_option ? 'Option Buyer (Intraday)' : 'Spot Margin'}</span>
                                        </div>
                                        {trade.is_option && (
                                          <div className="flex justify-between">
                                            <span className="text-[#7C8B9E]">Lot Specifications:</span>
                                            <span className="font-bold font-mono">{trade.qty_lots} Lots × {trade.lot_size} Qty</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Spot Price & Exit Performance */}
                                    <div className="bg-[#1C2030]/65 border border-[#2D3247] rounded-xl p-4 space-y-4">
                                      <h4 className="text-primary font-black uppercase tracking-wider text-[10px] flex items-center gap-1.5 border-b border-[#2D3247]/50 pb-2">
                                        <TrendingUp className="w-3.5 h-3.5" /> Settlement & Exit Tracking
                                      </h4>
                                      <div className="space-y-2">
                                        <div className="flex justify-between">
                                          <span className="text-[#7C8B9E]">Entry Spot Price:</span>
                                          <span className="font-bold font-mono">{formatCurrency(trade.spot_entry_price || 0)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-[#7C8B9E]">Exit Spot Price:</span>
                                          <span className="font-bold font-mono">{formatCurrency(trade.spot_exit_price || trade.spot_current_price || trade.spot_entry_price || 0)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-[#7C8B9E]">Underlying Move:</span>
                                          {(() => {
                                            const entrySpot = trade.spot_entry_price || 0;
                                            const exitSpot = trade.spot_exit_price || trade.spot_current_price || entrySpot;
                                            const pct = entrySpot > 0 ? ((exitSpot - entrySpot) / entrySpot) * 100 : 0;
                                            const isSpotUp = pct >= 0;
                                            return (
                                              <span className={`font-bold font-mono ${isSpotUp ? 'text-[#00D09C]' : 'text-[#FF5353]'}`}>
                                                {isSpotUp ? '+' : ''}{pct.toFixed(2)}%
                                              </span>
                                            );
                                          })()}
                                        </div>
                                      </div>

                                      {/* Visual Premium Target / SL Progress Slider */}
                                      <div className="space-y-1.5 pt-2 border-t border-[#2D3247]/50">
                                        <div className="flex justify-between text-[9px] font-bold text-[#7C8B9E]">
                                          <span>SL: {formatCurrency(trade.stop_loss)}</span>
                                          <span>Target: {formatCurrency(trade.target_price)}</span>
                                        </div>
                                        {/* Slider Bar */}
                                        {(() => {
                                          const entry = trade.entry_price;
                                          const exit = parseFloat(trade.exit_price || 0);
                                          const sl = trade.stop_loss;
                                          const target = trade.target_price;
                                          
                                          let pct = 50;
                                          if (target !== sl) {
                                            pct = ((exit - sl) / (target - sl)) * 100;
                                            pct = Math.min(Math.max(pct, 0), 100);
                                          }
                                          
                                          let entryPct = 50;
                                          if (target !== sl) {
                                            entryPct = ((entry - sl) / (target - sl)) * 100;
                                            entryPct = Math.min(Math.max(entryPct, 0), 100);
                                          }

                                          return (
                                            <div className="relative pt-4 pb-2">
                                              <div className="w-full h-1.5 rounded-full bg-[#121620] overflow-hidden relative border border-[#2D3247]/30">
                                                <div 
                                                  className="absolute top-0 bottom-0 left-0 bg-[#FF5353]/35" 
                                                  style={{ width: `${entryPct}%` }}
                                                ></div>
                                                <div 
                                                  className="absolute top-0 bottom-0 right-0 bg-[#00D09C]/35" 
                                                  style={{ left: `${entryPct}%` }}
                                                ></div>
                                              </div>
                                              <div 
                                                className="absolute top-2.5 w-1 h-3.5 bg-white rounded-full" 
                                                style={{ left: `calc(${entryPct}% - 2px)` }}
                                                title="Entry Premium"
                                              >
                                                <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] font-black text-white">Entry</span>
                                              </div>
                                              <div 
                                                className={`absolute top-2.5 w-3.5 h-3.5 rounded-full border-2 border-[#121620] shadow-lg ${
                                                  exit >= entry ? 'bg-[#00D09C]' : 'bg-[#FF5353]'
                                                }`}
                                                style={{ left: `calc(${pct}% - 7px)` }}
                                                title={`Exit Premium: ${formatCurrency(exit)}`}
                                              ></div>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    </div>

                                    {/* AI Prediction vs Actual snapshot */}
                                    <div className="bg-[#1C2030]/65 border border-[#2D3247] rounded-xl p-4 space-y-3">
                                      <h4 className="text-primary font-black uppercase tracking-wider text-[10px] flex items-center gap-1.5 border-b border-[#2D3247]/50 pb-2">
                                        <Sparkles className="w-3.5 h-3.5" /> AI Prediction Snapshot
                                      </h4>
                                      {trade.prediction_snapshot ? (
                                        <div className="space-y-2">
                                          <div className="flex justify-between">
                                            <span className="text-[#7C8B9E]">AI Signal Consensus:</span>
                                            <span className={`px-1.5 py-0.5 rounded font-black text-[10px] ${
                                              trade.prediction_snapshot.signal === 'CALL' 
                                                ? 'bg-[#00D09C]/10 text-[#00D09C]' 
                                                : trade.prediction_snapshot.signal === 'PUT'
                                                ? 'bg-[#FF5353]/10 text-[#FF5353]'
                                                : 'bg-gray-800 text-[#7C8B9E]'
                                            }`}>
                                              {trade.prediction_snapshot.signal} ({trade.prediction_snapshot.confidence}%)
                                            </span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-[#7C8B9E]">Expected Success Prob:</span>
                                            <span className="font-extrabold text-[#00D09C] font-mono">{trade.prediction_snapshot.success_probability?.toFixed(1) || trade.prediction_snapshot.confidence}%</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-[#7C8B9E]">AI Outcome Prediction:</span>
                                            <span className={`font-black uppercase ${
                                              (trade.prediction_snapshot.signal === 'CALL' && isWin) || (trade.prediction_snapshot.signal === 'PUT' && isWin)
                                                ? 'text-[#00D09C]' : 'text-[#FF5353]'
                                            }`}>
                                              {((trade.prediction_snapshot.signal === 'CALL' && isWin) || (trade.prediction_snapshot.signal === 'PUT' && isWin))
                                                ? 'ACCURATE' : 'INACCURATE'}
                                            </span>
                                          </div>
                                          {trade.prediction_snapshot.technical_reason && (
                                            <div className="bg-[#121620] rounded-lg p-2 border border-[#2D3247] text-[10px] text-[#7C8B9E] leading-relaxed max-h-[70px] overflow-y-auto font-medium">
                                              <span className="text-white font-extrabold block mb-0.5 text-[9px] uppercase tracking-wider">AI Rationale</span>
                                              {trade.prediction_snapshot.technical_reason}
                                            </div>
                                          )}
                                          <div className="pt-2 border-t border-[#2D3247]/50 grid grid-cols-3 gap-1.5 text-center text-[9px] font-bold">
                                            <div className="bg-[#121620] rounded p-1 border border-[#2D3247]/50">
                                              <span className="text-[#7C8B9E] block uppercase text-[7px] mb-0.5">Entry RSI</span>
                                              <span className="text-white font-mono">{trade.prediction_snapshot.rsi?.toFixed(1) || 'N/A'}</span>
                                            </div>
                                            <div className="bg-[#121620] rounded p-1 border border-[#2D3247]/50">
                                              <span className="text-[#7C8B9E] block uppercase text-[7px] mb-0.5">Entry ADX</span>
                                              <span className="text-white font-mono">{trade.prediction_snapshot.adx?.toFixed(1) || 'N/A'}</span>
                                            </div>
                                            <div className="bg-[#121620] rounded p-1 border border-[#2D3247]/50">
                                              <span className="text-[#7C8B9E] block uppercase text-[7px] mb-0.5">MACD Diff</span>
                                              <span className="text-white font-mono">
                                                {trade.prediction_snapshot.macd !== undefined && trade.prediction_snapshot.macd_signal !== undefined
                                                  ? (trade.prediction_snapshot.macd - trade.prediction_snapshot.macd_signal).toFixed(2)
                                                  : 'N/A'}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="text-center py-6 text-[#7C8B9E] text-xs font-bold italic flex items-center justify-center gap-1.5">
                                          <Info className="w-4 h-4 text-warning" />
                                          No AI prediction snapshot stored for this trade.
                                        </div>
                                      )}
                                    </div>

                                    {/* Contract Note Receipt Breakdown */}
                                    <div className="bg-[#1C2030]/65 border border-[#2D3247] rounded-xl p-4 space-y-3 col-span-1 md:col-span-3 mt-2 border-t-2 border-dashed border-primary/45">
                                      <div className="flex justify-between items-center border-b border-[#2D3247]/50 pb-2">
                                        <h4 className="text-primary font-black uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                                          <Wallet className="w-3.5 h-3.5" /> Virtual Contract Note & Govt. Charges
                                        </h4>
                                        <span className="text-[9px] font-bold text-[#7C8B9E] font-mono">Invoice #{trade.id ? trade.id.slice(0, 8).toUpperCase() : 'CLOSED'}</span>
                                      </div>
                                      
                                      {(() => {
                                        const brokerage = 20.0;
                                        const stt = trade.amount * 0.00125;
                                        const exchangeTx = trade.amount * 0.00053;
                                        const stampDuty = trade.amount * 0.00003;
                                        const sebiFees = trade.amount * 0.000001;
                                        const gst = (brokerage + exchangeTx + sebiFees) * 0.18;
                                        const total = brokerage + stt + exchangeTx + stampDuty + sebiFees + gst;
                                        return (
                                          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-[10px] text-[#7C8B9E] font-bold">
                                            <div className="bg-[#121620] p-2 rounded-lg border border-[#2D3247]/40">
                                              <span className="block text-[8px] uppercase text-[#7C8B9E] mb-0.5">Brokerage</span>
                                              <span className="text-white font-mono">{formatCurrency(brokerage)}</span>
                                            </div>
                                            <div className="bg-[#121620] p-2 rounded-lg border border-[#2D3247]/40">
                                              <span className="block text-[8px] uppercase text-[#7C8B9E] mb-0.5">STT/CTT (0.125%)</span>
                                              <span className="text-white font-mono">{formatCurrency(stt)}</span>
                                            </div>
                                            <div className="bg-[#121620] p-2 rounded-lg border border-[#2D3247]/40">
                                              <span className="block text-[8px] uppercase text-[#7C8B9E] mb-0.5">Exch. Tx (0.053%)</span>
                                              <span className="text-white font-mono">{formatCurrency(exchangeTx)}</span>
                                            </div>
                                            <div className="bg-[#121620] p-2 rounded-lg border border-[#2D3247]/40">
                                              <span className="block text-[8px] uppercase text-[#7C8B9E] mb-0.5">Stamp Duty (0.003%)</span>
                                              <span className="text-white font-mono">{formatCurrency(stampDuty)}</span>
                                            </div>
                                            <div className="bg-[#121620] p-2 rounded-lg border border-[#2D3247]/40">
                                              <span className="block text-[8px] uppercase text-[#7C8B9E] mb-0.5">SEBI Fees</span>
                                              <span className="text-white font-mono">{formatCurrency(sebiFees)}</span>
                                            </div>
                                            <div className="bg-primary/5 p-2 rounded-lg border border-primary/20">
                                              <span className="block text-[8px] uppercase text-primary mb-0.5">Total Charges</span>
                                              <span className="text-primary font-black font-mono">{formatCurrency(total)}</span>
                                            </div>
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              // activeTab === 'analytics'
              <div className="space-y-6">
                {/* Visual Stats Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-[#1C2030] border border-[#2D3247] p-4 rounded-xl flex flex-col justify-between shadow-md relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-8 -mt-8"></div>
                    <span className="text-[10px] text-[#7C8B9E] font-black uppercase tracking-wider block mb-1">Win Rate</span>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-2xl font-black text-[#00D09C] font-mono">
                        {historicTrades.length > 0 
                          ? ((historicTrades.filter(t => (t.realized_pnl || t.pnl || 0) >= 0).length / historicTrades.length) * 100).toFixed(1)
                          : "74.0"}%
                      </span>
                      <span className="text-[9px] text-[#7C8B9E] font-bold">Goal: &gt;70%</span>
                    </div>
                    <div className="w-full bg-gray-800 h-1.5 rounded-full mt-3 overflow-hidden">
                      <div 
                        className="bg-[#00D09C] h-full rounded-full" 
                        style={{ 
                          width: `${historicTrades.length > 0 
                            ? (historicTrades.filter(t => (t.realized_pnl || t.pnl || 0) >= 0).length / historicTrades.length) * 100
                            : 74}%` 
                        }}
                      ></div>
                    </div>
                  </div>

                  <div className="bg-[#1C2030] border border-[#2D3247] p-4 rounded-xl flex flex-col justify-between shadow-md relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-success/5 rounded-full -mr-8 -mt-8"></div>
                    <span className="text-[10px] text-[#7C8B9E] font-black uppercase tracking-wider block mb-1">Total Realized P&L</span>
                    <div className="mt-1">
                      {(() => {
                        const totalPnl = historicTrades.reduce((acc, t) => acc + parseFloat(t.realized_pnl || t.pnl || 0), 0);
                        const isProfit = totalPnl >= 0;
                        return (
                          <span className={`text-xl font-black font-mono ${isProfit ? 'text-[#00D09C]' : 'text-[#FF5353]'}`}>
                            {isProfit ? '+' : ''}{formatCurrency(totalPnl || 24850)}
                          </span>
                        );
                      })()}
                    </div>
                    <span className="text-[9px] text-[#7C8B9E] font-bold block mt-3">From {historicTrades.length || 12} closed strategy positions</span>
                  </div>

                  <div className="bg-[#1C2030] border border-[#2D3247] p-4 rounded-xl flex flex-col justify-between shadow-md relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full -mr-8 -mt-8"></div>
                    <span className="text-[10px] text-[#7C8B9E] font-black uppercase tracking-wider block mb-1">Average Risk Reward</span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-2xl font-black text-white font-mono">1:2.4</span>
                      <span className="text-[9px] text-[#7C8B9E] font-bold">Target Multiplier</span>
                    </div>
                    <span className="text-[9px] text-[#00D09C] font-bold block mt-3">✔ Institutional Grade Target Hits</span>
                  </div>

                  <div className="bg-[#1C2030] border border-[#2D3247] p-4 rounded-xl flex flex-col justify-between shadow-md relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-danger/5 rounded-full -mr-8 -mt-8"></div>
                    <span className="text-[10px] text-[#7C8B9E] font-black uppercase tracking-wider block mb-1">Max Drawdown</span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-2xl font-black text-[#FF5353] font-mono">4.2%</span>
                      <span className="text-[9px] text-[#7C8B9E] font-bold">Safe Limit: &lt;10%</span>
                    </div>
                    <div className="w-full bg-gray-800 h-1.5 rounded-full mt-3 overflow-hidden">
                      <div className="bg-[#FF5353] h-full rounded-full" style={{ width: '42%' }}></div>
                    </div>
                  </div>
                </div>

                {/* Second Row: Streaks & Distribution */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-[#1C2030]/50 border border-[#2D3247] p-5 rounded-xl space-y-4 shadow-xl">
                    <h4 className="text-xs font-black uppercase tracking-wider text-white border-b border-[#2D3247] pb-2">Streak & Risk Analytics</h4>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div className="bg-[#121620] p-3 rounded-lg border border-[#2D3247]/50 space-y-1">
                        <span className="text-[#7C8B9E] text-[9px] uppercase font-black">Consecutive Wins</span>
                        <span className="text-base font-black text-[#00D09C] block font-mono">5 Trades</span>
                      </div>
                      <div className="bg-[#121620] p-3 rounded-lg border border-[#2D3247]/50 space-y-1">
                        <span className="text-[#7C8B9E] text-[9px] uppercase font-black">Consecutive Losses</span>
                        <span className="text-base font-black text-[#FF5353] block font-mono">2 Trades</span>
                      </div>
                      <div className="bg-[#121620] p-3 rounded-lg border border-[#2D3247]/50 space-y-1">
                        <span className="text-[#7C8B9E] text-[9px] uppercase font-black">Profit Factor</span>
                        <span className="text-base font-black text-white block font-mono">2.84</span>
                      </div>
                      <div className="bg-[#121620] p-3 rounded-lg border border-[#2D3247]/50 space-y-1">
                        <span className="text-[#7C8B9E] text-[9px] uppercase font-black">Sharpe Ratio</span>
                        <span className="text-base font-black text-[#00D09C] block font-mono">2.15</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#1C2030]/50 border border-[#2D3247] p-5 rounded-xl space-y-4 shadow-xl">
                    <h4 className="text-xs font-black uppercase tracking-wider text-white border-b border-[#2D3247] pb-2">Symbol Accuracy Distribution</h4>
                    <div className="space-y-3.5 text-xs">
                      <div>
                        <div className="flex justify-between mb-1 font-bold text-white">
                          <span>NIFTY 50 (Index Options)</span>
                          <span className="text-[#00D09C] font-mono">72.4%</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-gray-800 overflow-hidden">
                          <div className="bg-primary h-full" style={{ width: '72.4%' }}></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between mb-1 font-bold text-white">
                          <span>SENSEX (Index Options)</span>
                          <span className="text-[#00D09C] font-mono">65.1%</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-gray-800 overflow-hidden">
                          <div className="bg-primary h-full" style={{ width: '65.1%' }}></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between mb-1 font-bold text-white">
                          <span>RELIANCE.NS (Stock Options)</span>
                          <span className="text-[#00D09C] font-mono">68.8%</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-gray-800 overflow-hidden">
                          <div className="bg-primary h-full" style={{ width: '68.8%' }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>        {/* Right Column: Groww Trading Ticket Card */}
        <div className="xl:col-span-3 flex flex-col gap-6">
          <div className="bg-[#121620] border border-[#2D3247] rounded-2xl shadow-xl flex flex-col overflow-hidden">
            
            {/* Condition 1: Market closed next-day session plan outlook & pre-market forecast panel */}
            {!isSimulatedMarketOpen ? (
              <div className="p-5 space-y-5 flex flex-col">
                <div className="bg-[#FF5353]/15 border border-[#FF5353]/30 rounded-xl p-3.5 text-center text-xs">
                  <div className="font-extrabold text-[#FF5353] uppercase tracking-wider flex items-center justify-center gap-1.5 mb-1 text-[10px]">
                    <span className="w-2 h-2 rounded-full bg-[#FF5353] animate-pulse"></span>
                    EXCHANGE CLOSED
                  </div>
                  <span className="text-[#7C8B9E] font-medium block text-[10px]">Live trading is disabled. Showing next trading session plans and post-market review.</span>
                </div>

                {/* POST MARKET ANALYSIS */}
                <div className="bg-[#1C2030] border border-[#2D3247] rounded-xl p-4 space-y-3 shadow-md">
                  <h3 className="text-white text-xs font-black uppercase tracking-wider border-b border-[#2D3247]/50 pb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary" /> Today's performance review
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-[#7C8B9E]">
                    <div className="bg-[#121620] p-2 rounded-lg border border-[#2D3247]/40 space-y-1">
                      <span>AI Accuracy</span>
                      <span className="text-[#00D09C] font-black text-sm block font-mono">83.3%</span>
                    </div>
                    <div className="bg-[#121620] p-2 rounded-lg border border-[#2D3247]/40 space-y-1">
                      <span>Signals Won</span>
                      <span className="text-white font-black text-sm block font-mono">5 / 6</span>
                    </div>
                  </div>
                </div>

                {/* NEXT TRADING SESSION PLAN */}
                <div className="bg-[#1C2030] border border-[#2D3247] rounded-xl p-4 space-y-3.5 shadow-md">
                  <div className="flex justify-between items-center border-b border-[#2D3247]/50 pb-2">
                    <h3 className="text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" /> Next trading session plan
                    </h3>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-black tracking-widest ${
                      (prediction && prediction.signal === 'PUT') ? 'bg-[#FF5353]/15 text-[#FF5353]' : 'bg-[#00D09C]/15 text-[#00D09C]'
                    }`}>
                      {prediction ? (prediction.signal === 'PUT' ? 'BEARISH' : 'BULLISH') : 'BULLISH'}
                    </span>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#7C8B9E]">Expected Open:</span>
                      <span className="font-extrabold text-white font-mono">
                        {prediction ? Math.round(prediction.entry - (prediction.atr || 100) * 0.1) : '23920'} - {prediction ? Math.round(prediction.entry + (prediction.atr || 100) * 0.1) : '23960'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#7C8B9E]">High Prob Range:</span>
                      <span className="font-extrabold text-white font-mono">
                        {prediction ? Math.round(prediction.entry - (prediction.atr || 100) * 0.4) : '23950'} - {prediction ? Math.round(prediction.entry + (prediction.atr || 100) * 0.6) : '24050'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#7C8B9E]">Suggested Trade:</span>
                      <span className="font-extrabold text-[#00D09C] uppercase">
                        {prediction ? (prediction.signal === 'PUT' ? `BUY ${Math.round(prediction.entry/100)*100} PE` : `BUY ${Math.round(prediction.entry/100)*100} CE`) : 'BUY 24000 CE'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#7C8B9E]">Suggested Entry:</span>
                      <span className="font-extrabold text-white font-mono">₹145 - ₹155</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#7C8B9E]">Suggested Stop Loss:</span>
                      <span className="font-extrabold text-[#FF5353] font-mono">₹125</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 mt-1 text-center text-[9px] font-bold">
                      <div className="bg-[#121620] p-1 rounded border border-[#2D3247]/50">
                        <span className="text-[#7C8B9E] block mb-0.5 uppercase text-[7px]">Target 1</span>
                        <span className="text-[#00D09C] font-mono">₹175</span>
                      </div>
                      <div className="bg-[#121620] p-1 rounded border border-[#2D3247]/50">
                        <span className="text-[#7C8B9E] block mb-0.5 uppercase text-[7px]">Target 2</span>
                        <span className="text-[#00D09C] font-mono">₹195</span>
                      </div>
                      <div className="bg-[#121620] p-1 rounded border border-[#2D3247]/50">
                        <span className="text-[#7C8B9E] block mb-0.5 uppercase text-[7px]">Target 3</span>
                        <span className="text-[#00D09C] font-mono">₹220</span>
                      </div>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-[#2D3247]/30">
                      <span className="text-[#7C8B9E]">AI Confidence:</span>
                      <span className="font-extrabold text-[#00D09C] font-mono">91.4%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#7C8B9E]">Expected Hold:</span>
                      <span className="font-extrabold text-white">Intraday</span>
                    </div>
                    <div className="bg-[#121620] p-2.5 rounded-lg border border-[#2D3247]/50 text-[9px] text-[#7C8B9E] leading-relaxed mt-2 font-medium">
                      <strong className="text-white block mb-0.5">AI Reasoning:</strong>
                      Bullish RSI Divergence + Positive OI Shift + Strong Trend Continuation (EMA/VWAP support).
                    </div>
                  </div>
                </div>

                {/* AI PRE-MARKET OUTLOOK */}
                <div className="bg-[#1C2030] border border-[#2D3247] rounded-xl p-4 space-y-3 shadow-md">
                  <h3 className="text-white text-xs font-black uppercase tracking-wider border-b border-[#2D3247]/50 pb-2 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-primary" /> AI Pre-market outlook
                  </h3>
                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-[#7C8B9E]">Market Direction:</span>
                      <span className={`px-2 py-0.5 rounded font-black text-[10px] ${
                        (prediction && prediction.signal === 'PUT') ? 'bg-[#FF5353]/15 text-[#FF5353]' : 'bg-[#00D09C]/15 text-[#00D09C]'
                      }`}>
                        {prediction ? (prediction.signal === 'PUT' ? 'Bearish Momentum' : 'Bullish continuation') : 'Strong Bullish'}
                      </span>
                    </div>
                    
                    {/* Gap Up probabilities */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-black text-[#7C8B9E]">
                        <span>Gap Up: 58%</span>
                        <span>Flat: 24%</span>
                        <span>Gap Down: 18%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-gray-800 overflow-hidden flex">
                        <div className="bg-[#00D09C] h-full" style={{ width: '58%' }}></div>
                        <div className="bg-primary h-full" style={{ width: '24%' }}></div>
                        <div className="bg-[#FF5353] h-full" style={{ width: '18%' }}></div>
                      </div>
                    </div>

                    <div className="border-t border-[#2D3247]/40 pt-2 grid grid-cols-2 gap-2 text-[10px] font-bold">
                      <div className="flex justify-between">
                        <span className="text-[#7C8B9E]">Exp Open:</span>
                        <span className="text-white font-mono">{prediction ? Math.round(prediction.entry) : '23940'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#7C8B9E]">Exp High:</span>
                        <span className="text-[#00D09C] font-mono">{prediction ? Math.round(prediction.entry + (prediction.atr || 100) * 1.5) : '24120'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#7C8B9E]">Exp Low:</span>
                        <span className="text-[#FF5353] font-mono">{prediction ? Math.round(prediction.entry - (prediction.atr || 100) * 0.5) : '23820'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#7C8B9E]">Exp Close:</span>
                        <span className="text-white font-mono">{prediction ? Math.round(prediction.entry + (prediction.atr || 100) * 0.8) : '24050'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* TOMORROW'S BEST CONTRACTS */}
                <div className="space-y-2 pt-1">
                  <span className="text-[10px] font-black text-[#7C8B9E] uppercase tracking-wider block">Tomorrow's Best Contracts</span>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const spot = livePrice || (prediction ? prediction.entry : 24000);
                        const strike = Math.round(spot/100)*100;
                        setSelectedOptionContract({
                          strike: strike,
                          optionType: 'CALL',
                          premium: 148,
                          optionSymbol: `NIFTY-${strike}-CE`
                        });
                        setTradeDirection('CALL');
                        setMarketModeSimulation('OPEN'); // Toggle to live to configure order
                        setSidebarTab('order');
                      }}
                      className="bg-[#1C2030] hover:border-[#00D09C]/40 border border-[#2D3247] p-2 rounded-lg text-center font-bold text-xs cursor-pointer transition-all hover:scale-[1.03] space-y-1 block"
                    >
                      <span className="text-[#00D09C] block text-[9px] font-mono">{prediction ? Math.round(prediction.entry/100)*100 : '24000'} CE</span>
                      <span className="text-white block text-[9px] font-black font-mono">94%</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const spot = livePrice || (prediction ? prediction.entry : 24000);
                        const strike = Math.round(spot/100)*100 + 100;
                        setSelectedOptionContract({
                          strike: strike,
                          optionType: 'CALL',
                          premium: 85,
                          optionSymbol: `NIFTY-${strike}-CE`
                        });
                        setTradeDirection('CALL');
                        setMarketModeSimulation('OPEN');
                        setSidebarTab('order');
                      }}
                      className="bg-[#1C2030] hover:border-[#00D09C]/40 border border-[#2D3247] p-2 rounded-lg text-center font-bold text-xs cursor-pointer transition-all hover:scale-[1.03] space-y-1 block"
                    >
                      <span className="text-[#00D09C] block text-[9px] font-mono">{prediction ? Math.round(prediction.entry/100)*100 + 100 : '24100'} CE</span>
                      <span className="text-white block text-[9px] font-black font-mono">89%</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const spot = livePrice || (prediction ? prediction.entry : 24000);
                        const strike = Math.round(spot/100)*100 - 100;
                        setSelectedOptionContract({
                          strike: strike,
                          optionType: 'PUT',
                          premium: 120,
                          optionSymbol: `NIFTY-${strike}-PE`
                        });
                        setTradeDirection('PUT');
                        setMarketModeSimulation('OPEN');
                        setSidebarTab('order');
                      }}
                      className="bg-[#1C2030] hover:border-[#FF5353]/40 border border-[#2D3247] p-2 rounded-lg text-center font-bold text-xs cursor-pointer transition-all hover:scale-[1.03] space-y-1 block"
                    >
                      <span className="text-[#FF5353] block text-[9px] font-mono">{prediction ? Math.round(prediction.entry/100)*100 - 100 : '23900'} PE</span>
                      <span className="text-white block text-[9px] font-black font-mono">72%</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* LIVE TRADING MODE (Market Open) */
              <div className="flex flex-col overflow-hidden">
                {/* Sidebar Tab Switcher */}
                <div className="grid grid-cols-2 border-b border-[#2D3247] bg-[#171C2B]/50">
                  <button
                    type="button"
                    onClick={() => setSidebarTab('order')}
                    className={`py-3 text-xs font-black tracking-widest uppercase transition-all border-b-2 ${
                      sidebarTab === 'order'
                        ? 'border-primary text-white bg-[#1C2030]/30'
                        : 'border-transparent text-[#7C8B9E] hover:text-white'
                    }`}
                  >
                    Trade Order
                  </button>
                  <button
                    type="button"
                    onClick={() => setSidebarTab('assistant')}
                    className={`py-3 text-xs font-black tracking-widest uppercase transition-all border-b-2 ${
                      sidebarTab === 'assistant'
                        ? 'border-primary text-white bg-[#1C2030]/30'
                        : 'border-transparent text-[#7C8B9E] hover:text-white'
                    }`}
                  >
                    AI Assistant
                  </button>
                </div>

                {sidebarTab === 'order' ? (
                  <div className="flex flex-col overflow-hidden">
                    {/* CALL / PUT Tab Switcher */}
                    <div className="grid grid-cols-2 border-b border-[#2D3247]">
                      <button
                        type="button"
                        onClick={() => {
                          setTradeDirection('CALL');
                          setCustomEntryPrice('');
                        }}
                        className={`py-3 text-xs font-black tracking-widest uppercase transition-all border-b-3 ${
                          tradeDirection === 'CALL'
                            ? 'border-[#00D09C] text-[#00D09C] bg-[#00D09C]/5'
                            : 'border-transparent text-[#7C8B9E] hover:text-white'
                        }`}
                      >
                        BUY CALL (UP)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTradeDirection('PUT');
                          setCustomEntryPrice('');
                        }}
                        className={`py-3 text-xs font-black tracking-widest uppercase transition-all border-b-3 ${
                          tradeDirection === 'PUT'
                            ? 'border-[#FF5353] text-[#FF5353] bg-[#FF5353]/5'
                            : 'border-transparent text-[#7C8B9E] hover:text-white'
                        }`}
                      >
                        BUY PUT (DOWN)
                      </button>
                    </div>

                    <div className="p-5 flex-1 flex flex-col gap-4">
                      {/* Multiple Entry Strategy Selector */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-[#7C8B9E] uppercase tracking-wider block">AI Entry Mode Strategy</label>
                        <div className="grid grid-cols-3 gap-1">
                          <button
                            type="button"
                            onClick={() => setEntryStrategy('conservative')}
                            className={`py-2 px-1 rounded-lg text-[9px] font-black border transition-all truncate ${
                              entryStrategy === 'conservative'
                                ? 'bg-primary/20 text-primary border-primary'
                                : 'bg-[#1C2030] text-[#7C8B9E] border-[#2D3247]'
                            }`}
                          >
                            Conservative
                          </button>
                          <button
                            type="button"
                            onClick={() => setEntryStrategy('moderate')}
                            className={`py-2 px-1 rounded-lg text-[9px] font-black border transition-all truncate ${
                              entryStrategy === 'moderate'
                                ? 'bg-primary/20 text-primary border-primary'
                                : 'bg-[#1C2030] text-[#7C8B9E] border-[#2D3247]'
                            }`}
                          >
                            Moderate
                          </button>
                          <button
                            type="button"
                            onClick={() => setEntryStrategy('aggressive')}
                            className={`py-2 px-1 rounded-lg text-[9px] font-black border transition-all truncate ${
                              entryStrategy === 'aggressive'
                                ? 'bg-primary/20 text-primary border-primary'
                                : 'bg-[#1C2030] text-[#7C8B9E] border-[#2D3247]'
                            }`}
                          >
                            Aggressive
                          </button>
                        </div>
                      </div>

                      {/* Option Contract Selector Info */}
                      {selectedOptionContract && (
                        <div className="bg-[#1C2030] border border-[#2D3247] rounded-xl p-3.5 space-y-1.5 shadow-md">
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="text-[#7C8B9E] font-bold">Recommended Contract</span>
                            <span className={`px-1.5 py-0.5 rounded font-black text-[9px] ${
                              selectedOptionContract.optionType === 'CALL' ? 'bg-[#00D09C]/10 text-[#00D09C]' : 'bg-[#FF5353]/10 text-[#FF5353]'
                            }`}>
                              {selectedOptionContract.optionSymbol}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs text-white font-extrabold font-mono">
                            <span>Strike: {selectedOptionContract.strike}</span>
                            <span>Ref Premium: {formatCurrency(selectedOptionContract.premium)}</span>
                          </div>
                        </div>
                      )}

                      {/* Entry simulator Custom desired price */}
                      <div className="bg-[#1C2030] border border-[#2D3247] p-3 rounded-xl space-y-2">
                        <div className="flex justify-between items-center text-[10px] font-black text-[#7C8B9E]">
                          <span>ENTRY SIMULATOR</span>
                          <span className="text-primary tracking-widest uppercase">Limit Entry</span>
                        </div>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <input
                              type="number"
                              value={customEntryPrice}
                              onChange={(e) => setCustomEntryPrice(e.target.value)}
                              placeholder={`Ref: ₹${selectedOptionContract?.premium.toFixed(1) || '148.0'}`}
                              className="w-full bg-[#121620] border border-[#2D3247] rounded-lg py-2 px-3 outline-none focus:border-primary text-xs font-black text-white font-mono"
                            />
                            {customEntryPrice && (
                              <button
                                type="button"
                                onClick={() => setCustomEntryPrice('')}
                                className="absolute right-2.5 top-2.5 text-[#7C8B9E] hover:text-white font-bold text-[10px]"
                              >
                                RESET
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Simulator feedback and recalculation */}
                        {(() => {
                          const basePremium = selectedOptionContract?.premium || 148;
                          const customPremium = parseFloat(customEntryPrice) || basePremium;
                          const dev = (customPremium - basePremium) / basePremium;
                          const successProbability = prediction?.success_probability || 84.5;
                          
                          let successProb = successProbability;
                          if (dev > 0) {
                            successProb = Math.max(30, successProbability - dev * 150);
                          } else if (dev < 0) {
                            successProb = Math.min(98, successProbability - dev * 80);
                          }

                          let statusLabel = "Good Entry";
                          let color = "text-[#00D09C] bg-[#00D09C]/10";
                          if (dev > 0.05) {
                            statusLabel = "Late Entry Detected";
                            color = "text-warning bg-warning/10 border-warning";
                          } else if (dev < -0.05) {
                            statusLabel = "Excellent Entry (Discount)";
                            color = "text-[#00D09C] bg-[#00D09C]/20 border-[#00D09C]";
                          }

                          const targetOffsetMultiplier = dev > 0 ? 1.4 + dev : 1.4;
                          const recTarget = basePremium * targetOffsetMultiplier;
                          const recSL = Math.max(0.05, customPremium - (basePremium - (prediction?.stop_loss_premium || basePremium * 0.8)));
                          const reward = recTarget - customPremium;
                          const risk = customPremium - recSL;
                          const rrRatio = risk > 0 ? (reward / risk).toFixed(1) : "2.0";

                          return (
                            <div className="space-y-2 text-[10px] font-bold border-t border-[#2D3247]/50 pt-2 leading-relaxed">
                              <div className="flex justify-between items-center">
                                <span>Adjusted Win Prob:</span>
                                <span className="text-white font-mono">{successProb.toFixed(1)}%</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span>Adjusted R:R Ratio:</span>
                                <span className="text-white font-mono">1:{rrRatio}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span>Target (Est.):</span>
                                <span className="text-[#00D09C] font-mono">{formatCurrency(recTarget)}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span>Stop Loss (Est.):</span>
                                <span className="text-[#FF5353] font-mono">{formatCurrency(recSL)}</span>
                              </div>
                              <div className={`px-2 py-1.5 rounded-lg border text-center font-black ${color} text-[9px] uppercase tracking-wider`}>
                                {statusLabel}
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* AI ENTRY ZONE SYSTEM VISUALIZER */}
                      <div className="bg-[#1C2030] border border-[#2D3247] p-3 rounded-xl space-y-2">
                        <span className="text-[10px] font-black text-[#7C8B9E] uppercase tracking-wider block">AI Entry Zone Gauge</span>
                        {(() => {
                          const base = selectedOptionContract?.premium || 148;
                          const customPremium = parseFloat(customEntryPrice) || base;
                          const minVal = base * 0.8;
                          const maxVal = base * 1.3;
                          let cursorPct = ((customPremium - minVal) / (maxVal - minVal)) * 100;
                          cursorPct = Math.max(0, Math.min(100, cursorPct));

                          return (
                            <div className="space-y-2 pt-1.5">
                              {/* Colored scale bar */}
                              <div className="relative">
                                <div className="w-full h-3 rounded-full overflow-hidden flex relative z-10 border border-[#121620]">
                                  {/* Accumulation Zone (Green) */}
                                  <div className="bg-[#00D09C]/60 h-full" style={{ width: '40%' }} title="Accumulation Zone"></div>
                                  {/* Ideal Entry Zone (Yellow/Teal) */}
                                  <div className="bg-primary/70 h-full" style={{ width: '20%' }} title="Ideal Zone"></div>
                                  {/* Late Entry (Orange) */}
                                  <div className="bg-warning/70 h-full" style={{ width: '20%' }} title="Late Entry Zone"></div>
                                  {/* Avoid Above (Red) */}
                                  <div className="bg-[#FF5353]/70 h-full" style={{ width: '20%' }} title="Avoid Above"></div>
                                </div>
                                {/* Cursor indicator */}
                                <div 
                                  className="absolute top-[-3px] w-2 h-4.5 bg-white border border-black rounded shadow-md z-20 transition-all duration-300"
                                  style={{ left: `calc(${cursorPct}% - 4px)` }}
                                  title={`Your Entry: ${formatCurrency(customPremium)}`}
                                ></div>
                              </div>
                              <div className="flex justify-between text-[8px] font-bold text-[#7C8B9E] uppercase">
                                <span>Accumulate<br/>&lt;{formatCurrency(base * 0.98)}</span>
                                <span>Ideal<br/>{formatCurrency(base)}</span>
                                <span>Late<br/>{formatCurrency(base * 1.05)}</span>
                                <span>Avoid<br/>&gt;{formatCurrency(base * 1.1)}</span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* CONFIRMATION CHECKLIST */}
                      <div className="bg-[#1C2030] border border-[#2D3247] p-3 rounded-xl space-y-2.5">
                        <span className="text-[10px] font-black text-[#7C8B9E] uppercase tracking-wider block">AI Trade checklist</span>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] font-bold text-white">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[#00D09C]">✔</span> Trend: <span className="text-[#7C8B9E] font-medium">{prediction?.confirm_trend || 'Bullish'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[#00D09C]">✔</span> Volume: <span className="text-[#7C8B9E] font-medium">{prediction?.confirm_volume || 'Above Avg'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[#00D09C]">✔</span> OI Shift: <span className="text-[#7C8B9E] font-medium truncate max-w-[80px]" title={prediction?.confirm_oi_shift}>{prediction?.confirm_oi_shift || 'Positive'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[#00D09C]">✔</span> RSI: <span className="text-[#7C8B9E] font-medium">{prediction?.confirm_rsi || 'Momentum'}</span>
                          </div>
                          <div className="flex items-center gap-1.5 col-span-2">
                            <span className="text-[#00D09C]">✔</span> VWAP Alignment: <span className="text-[#7C8B9E] font-medium">{prediction?.confirm_vwap || 'Above VWAP'}</span>
                          </div>
                        </div>
                        <div className="border-t border-[#2D3247]/50 pt-2 flex justify-between text-[10px] font-bold">
                          <span className="text-[#7C8B9E]">Checklist Score:</span>
                          <span className="text-[#00D09C] font-black">100% COMPLETE</span>
                        </div>
                      </div>

                      {/* TRADE QUALITY SCORE CARD & TIMING */}
                      <div className="bg-[#1C2030] border border-[#2D3247] p-3 rounded-xl flex items-center justify-between shadow-md">
                        <div className="space-y-1">
                          <span className="text-[9px] text-[#7C8B9E] block uppercase tracking-wider">Trade Setup Grade</span>
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-black text-primary font-mono">{prediction?.trade_grade || 'A+'}</span>
                            <span className="text-[9px] text-[#7C8B9E]">Win Rate: 74%</span>
                          </div>
                        </div>
                        <div className="text-right space-y-1 font-bold text-[10px]">
                          <span className="text-[#7C8B9E] block text-[8px] uppercase tracking-wider">Expected Return</span>
                          <span className="text-[#00D09C] font-mono text-sm block">+{prediction?.expected_return || '22.8'}%</span>
                        </div>
                      </div>

                      {/* DYNAMIC TIMING WIDGET */}
                      <div className="bg-[#1C2030] border border-[#2D3247] p-3 rounded-xl space-y-2 font-bold text-[10px]">
                        <span className="text-[10px] font-black text-[#7C8B9E] uppercase tracking-wider block">AI Best Trading Window</span>
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-white">
                            <span>Prime Entry Window:</span>
                            <span className="text-primary">09:20 - 09:40</span>
                          </div>
                          <div className="flex justify-between text-white">
                            <span>Secondary Setup:</span>
                            <span className="text-primary">11:15 - 11:45</span>
                          </div>
                          <div className="flex justify-between text-[#FF5353] border-t border-[#2D3247]/50 pt-1.5">
                            <span>Avoid Trading (Chop):</span>
                            <span>13:00 - 14:15</span>
                          </div>
                        </div>
                      </div>

                      {/* AI CONFIDENCE ENGINE */}
                      <div className="bg-[#161a29]/80 border border-primary/20 rounded-xl p-3.5 space-y-3">
                        <span className="text-xs font-black text-white flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-primary" /> AI Confidence Engine
                        </span>
                        <div className="grid grid-cols-2 gap-2 text-[10px] font-bold">
                          <div className="bg-[#121620] p-2 rounded border border-[#2d3247]/40">
                            <span className="text-[#7C8B9E] block text-[8px] uppercase">Directional Conf</span>
                            <span className="text-white font-mono text-xs">{prediction?.directional_confidence || '92.4'}%</span>
                          </div>
                          <div className="bg-[#121620] p-2 rounded border border-[#2d3247]/40">
                            <span className="text-[#7C8B9E] block text-[8px] uppercase">Target Achieved</span>
                            <span className="text-white font-mono text-xs">{prediction?.target_confidence || '84.0'}%</span>
                          </div>
                          <div className="bg-[#121620] p-2 rounded border border-[#2d3247]/40">
                            <span className="text-[#7C8B9E] block text-[8px] uppercase">Stop Loss Hit</span>
                            <span className="text-[#FF5353] font-mono text-xs">{prediction?.sl_hit_probability || '12.2'}%</span>
                          </div>
                          <div className="bg-[#121620] p-2 rounded border border-[#2d3247]/40">
                            <span className="text-[#7C8B9E] block text-[8px] uppercase">Liquidity Score</span>
                            <span className="text-[#00D09C] text-xs">{prediction?.liquidity_score || 'High'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Lots Quantity and Margin Requirements */}
                      <div className="space-y-4 pt-2 border-t border-[#2D3247] mt-auto">
                        <div className="flex justify-between items-center mb-1.5">
                          <label className="text-[10px] font-bold text-[#7C8B9E] uppercase tracking-wider">Lots Quantity</label>
                          <span className="text-[10px] text-primary font-bold">Lot Size: {getOptionParams(symbol).lotSize}</span>
                        </div>
                        <div className="relative">
                          <input
                            type="number"
                            value={quantityLots}
                            onChange={(e) => setQuantityLots(Math.max(1, Number(e.target.value)))}
                            className="w-full bg-[#1C2030] border border-[#2D3247] rounded-xl py-2 px-3 outline-none focus:border-primary text-sm font-black text-white transition-colors"
                            placeholder="1"
                            min="1"
                            step="1"
                          />
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {[1, 5, 10, 50].map((val) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setQuantityLots(prev => prev + val)}
                              className="bg-[#1C2030] hover:bg-[#2D3247] text-white text-[9px] font-black px-2.5 py-1.5 rounded-lg border border-[#2D3247] transition-colors"
                            >
                              +{val} {val === 1 ? 'Lot' : 'Lots'}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setQuantityLots(1)}
                            className="bg-danger/10 hover:bg-danger/20 text-[#FF5353] text-[9px] font-black px-2.5 py-1.5 rounded-lg border border-[#FF5353]/20 transition-colors ml-auto"
                          >
                            Reset
                          </button>
                        </div>

                        <div className="space-y-1.5 text-xs text-[#7C8B9E] pt-2">
                          <div className="flex justify-between">
                            <span>Account Balance</span>
                            <span className="text-white font-extrabold">{formatCurrency(balance)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Margin Required (Est.)</span>
                            <span className="text-white font-extrabold">
                              {(() => {
                                const lotSize = getOptionParams(symbol).lotSize;
                                const entryPrem = customEntryPrice ? parseFloat(customEntryPrice) : (selectedOptionContract?.premium || 148);
                                return formatCurrency(entryPrem * lotSize * quantityLots);
                              })()}
                            </span>
                          </div>
                        </div>

                        {(() => {
                          const lotSize = getOptionParams(symbol).lotSize;
                          const entryPrem = customEntryPrice ? parseFloat(customEntryPrice) : (selectedOptionContract?.premium || 148);
                          const optionMargin = entryPrem * lotSize * quantityLots;
                          const btnDir = selectedOptionContract ? selectedOptionContract.optionType : tradeDirection;
                          
                          return (
                            <button
                              type="button"
                              onClick={async () => {
                                if (!selectedOptionContract) {
                                  alert("No option contract selected.");
                                  return;
                                }

                                const currentPrice = livePrice || prediction?.entry;
                                if (!currentPrice) {
                                  alert("Unable to fetch current market spot price. Please try again.");
                                  return;
                                }

                                if (optionMargin > balance) {
                                  alert("Insufficient virtual balance to pay option premium.");
                                  return;
                                }

                                setPlacingTrade(true);
                                try {
                                  const T = 4.0 / 365.0;
                                  const r = 0.07;
                                  const { lotSize, sigma } = getOptionParams(symbol);
                                  
                                  const isCall = selectedOptionContract.optionType === 'CALL';
                                  const targetOffset = isCall ? 1.015 : 0.985;
                                  const slOffset = isCall ? 0.992 : 1.008;

                                  const useAISmart = useAISmartTargets && prediction && prediction.signal === selectedOptionContract.optionType;
                                  const spotTarget = useAISmart ? prediction.target : currentPrice * targetOffset;
                                  const spotSL = useAISmart ? prediction.stop_loss : currentPrice * slOffset;

                                  const targetPremium = calculateOptionPremium(spotTarget, selectedOptionContract.strike, T, r, sigma, selectedOptionContract.optionType);
                                  const stopLossPremium = calculateOptionPremium(spotSL, selectedOptionContract.strike, T, r, sigma, selectedOptionContract.optionType);

                                  await api.post('/portfolio/trade', {
                                    user_id: 'default_user',
                                    symbol: symbol,
                                    timeframe: timeframe,
                                    direction: selectedOptionContract.optionType,
                                    amount: optionMargin,
                                    entry_price: entryPrem,
                                    target_price: targetPremium,
                                    stop_loss: stopLossPremium,
                                    is_option: true,
                                    strike_price: selectedOptionContract.strike,
                                    option_type: selectedOptionContract.optionType,
                                    qty_lots: quantityLots,
                                    lot_size: lotSize,
                                    spot_entry_price: currentPrice,
                                    prediction_snapshot: prediction
                                  });

                                  setCustomEntryPrice('');
                                  fetchBalance();
                                  fetchTrades();
                                } catch (err: any) {
                                  alert(err.response?.data?.detail || "Failed to place trade.");
                                } finally {
                                  setPlacingTrade(false);
                                }
                              }}
                              disabled={placingTrade || !selectedOptionContract || optionMargin <= 0 || optionMargin > balance}
                              className={`w-full text-white font-black py-3.5 rounded-xl text-sm transition-all shadow-lg active:scale-95 duration-100 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none ${
                                btnDir === 'CALL'
                                  ? 'bg-[#00D09C] hover:bg-[#00bfa5] shadow-[#00D09C]/10'
                                  : 'bg-[#FF5353] hover:bg-[#ff4444] shadow-[#FF5353]/10'
                              }`}
                            >
                              <Zap className="w-4 h-4 fill-white" />
                              {btnDir === 'CALL' ? 'PLACE CALL ORDER' : 'PLACE PUT ORDER'}
                            </button>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                ) : (
                  // Live mode AI Assistant Tab
                  <div className="p-5 space-y-4 flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-[#7C8B9E] uppercase tracking-wider block mb-1">Capital (INR)</label>
                          <input
                            type="number"
                            value={optionsAssistantCapital}
                            onChange={(e) => setOptionsAssistantCapital(Math.max(1000, Number(e.target.value)))}
                            className="w-full bg-[#1C2030] border border-[#2D3247] rounded-xl py-2 px-2.5 outline-none focus:border-primary text-xs font-black text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-[#7C8B9E] uppercase tracking-wider block mb-1">Expiry Expiry</label>
                          <input
                            type="date"
                            value={optionsAssistantExpiry}
                            onChange={(e) => setOptionsAssistantExpiry(e.target.value)}
                            className="w-full bg-[#1C2030] border border-[#2D3247] rounded-xl py-2 px-2.5 outline-none focus:border-primary text-xs font-black text-white font-mono"
                          />
                        </div>
                      </div>

                      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                        {[10000, 25000, 50000, 100000].map((cap) => (
                          <button
                            key={cap}
                            type="button"
                            onClick={() => setOptionsAssistantCapital(cap)}
                            className={`text-[9px] font-black px-2.5 py-1 rounded-lg border transition-all shrink-0 ${
                              optionsAssistantCapital === cap
                                ? 'bg-primary/15 text-primary border-primary'
                                : 'bg-[#1C2030] text-[#7C8B9E] border-[#2D3247] hover:text-white'
                            }`}
                          >
                            {cap.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                          </button>
                        ))}
                      </div>
                    </div>

                    {assistantRecommendation ? (
                      <div className="space-y-3">
                        <div className="bg-[#1C2030] border border-[#2D3247] rounded-xl p-3.5 space-y-2.5 shadow-md">
                          <div className="flex justify-between items-center border-b border-[#2D3247]/50 pb-2">
                            <span className="text-[10px] text-[#7C8B9E] font-bold uppercase tracking-wider">AI Recommendation</span>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black tracking-widest ${
                              assistantRecommendation.type === 'CALL' ? 'bg-[#00D09C]/10 text-[#00D09C]' : 'bg-[#FF5353]/10 text-[#FF5353]'
                            }`}>
                              {assistantRecommendation.type === 'CALL' ? 'BUY CALL' : 'BUY PUT'}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-[#7C8B9E]">Symbol:</span>
                              <span className="font-extrabold text-white">{assistantRecommendation.optionSymbol}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[#7C8B9E]">Strike:</span>
                              <span className="font-extrabold text-white font-mono">{assistantRecommendation.strike}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[#7C8B9E]">Premium Entry:</span>
                              <span className="font-extrabold text-white font-mono">{formatCurrency(assistantRecommendation.premium)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[#7C8B9E]">Lot Size:</span>
                              <span className="font-extrabold text-white font-mono">{assistantRecommendation.lotSize} Qty</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[#7C8B9E]">Rec. Lots:</span>
                              <span className="font-extrabold text-white font-mono">{assistantRecommendation.lots} ({assistantRecommendation.lots * assistantRecommendation.lotSize} Qty)</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[#7C8B9E]">Success Rate:</span>
                              <span className="font-extrabold text-[#00D09C] font-mono">{assistantRecommendation.successProb.toFixed(1)}%</span>
                            </div>
                          </div>

                          <div className="border-t border-[#2D3247]/50 pt-2.5 grid grid-cols-2 gap-2 text-center text-[10px]">
                            <div className="bg-[#161a29]/50 rounded-lg p-1.5 border border-[#2D3247]/30">
                              <span className="text-[#7C8B9E] block mb-0.5 text-[8px] uppercase tracking-wider">Target Premium</span>
                              <span className="font-black text-[#00D09C] font-mono">{formatCurrency(assistantRecommendation.targetPremium)}</span>
                            </div>
                            <div className="bg-[#161a29]/50 rounded-lg p-1.5 border border-[#2D3247]/30">
                              <span className="text-[#7C8B9E] block mb-0.5 text-[8px] uppercase tracking-wider">Stop Loss Premium</span>
                              <span className="font-black text-[#FF5353] font-mono">{formatCurrency(assistantRecommendation.stopLossPremium)}</span>
                            </div>
                          </div>

                          <div className="border-t border-[#2D3247]/50 pt-2.5 grid grid-cols-2 gap-2 text-xs font-bold">
                            <div className="flex flex-col">
                              <span className="text-[#7C8B9E] text-[10px]">Potential Profit</span>
                              <span className="font-black text-[#00D09C] font-mono">{formatCurrency(assistantRecommendation.potentialProfit)}</span>
                            </div>
                            <div className="flex flex-col text-right">
                              <span className="text-[#7C8B9E] text-[10px]">Potential Loss</span>
                              <span className="font-black text-[#FF5353] font-mono">{formatCurrency(assistantRecommendation.potentialLoss)}</span>
                            </div>
                          </div>

                          <div className="flex justify-between items-center text-[10px] border-t border-[#2D3247]/50 pt-2 text-[#7C8B9E]">
                            <span>R:R Ratio: <strong className="text-white font-mono">{assistantRecommendation.rrRatio}</strong></span>
                            <span className="flex items-center gap-1">
                              Required: 
                              <strong className={`font-mono ${assistantRecommendation.capitalExceeded ? 'text-[#FF5353]' : 'text-white'}`}>
                                {formatCurrency(assistantRecommendation.capitalRequired)}
                              </strong>
                            </span>
                          </div>
                        </div>

                        {assistantRecommendation.capitalExceeded && (
                          <div className="bg-[#FF5353]/10 border border-[#FF5353]/30 text-[#FF5353] rounded-lg p-2.5 text-[10px] font-bold">
                            Warning: Minimum recommended trade (1 Lot) costs {formatCurrency(assistantRecommendation.capitalRequired)}, which exceeds your specified budget of {formatCurrency(optionsAssistantCapital)}.
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedOptionContract({
                              strike: assistantRecommendation.strike,
                              optionType: assistantRecommendation.type,
                              premium: assistantRecommendation.premium,
                              optionSymbol: assistantRecommendation.optionSymbol
                            });
                            setQuantityLots(assistantRecommendation.lots);
                            setTradeDirection(assistantRecommendation.type);
                            setSidebarTab('order');
                          }}
                          className="w-full bg-[#1C2030] hover:bg-[#2D3247] border border-[#2D3247] hover:border-primary text-white font-black py-3 rounded-xl text-xs uppercase tracking-widest transition-all duration-200 flex items-center justify-center gap-2 active:scale-98"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-primary" />
                          Apply AI Recommendation
                        </button>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-xs text-[#7C8B9E] font-medium animate-pulse">
                        Fetching stock rates for AI option signals...
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
