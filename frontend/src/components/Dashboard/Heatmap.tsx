import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { socket } from '../../services/socket';
import { TrendingUp, TrendingDown, RefreshCw, AlertCircle, Sparkles } from 'lucide-react';

interface MarketItem {
  symbol: string;
  name: string;
  price: number | null;
  changePercent: number | null;
  loading: boolean;
  error: boolean;
}

interface PredictionSignal {
  symbol: string;
  signal: 'CALL' | 'PUT' | 'NO TRADE';
  confidence: number;
  timeframe: string;
}

const WATCHLIST_SYMBOLS = [
  { symbol: '^NSEI', name: 'Nifty 50' },
  { symbol: '^BSESN', name: 'BSE Sensex' },
  { symbol: 'RELIANCE.NS', name: 'Reliance Industries' },
  { symbol: 'HDFCBANK.NS', name: 'HDFC Bank' }
];

const TIMEFRAMES = ['15m', '30m', '1h', '1d'];

export default function Heatmap() {
  const [marketData, setMarketData] = useState<Record<string, MarketItem>>(() => {
    const initial: Record<string, MarketItem> = {};
    WATCHLIST_SYMBOLS.forEach(item => {
      initial[item.symbol] = {
        symbol: item.symbol,
        name: item.name,
        price: null,
        changePercent: null,
        loading: true,
        error: false
      };
    });
    return initial;
  });

  // Map of symbol -> Record of timeframe -> PredictionSignal
  const [predictions, setPredictions] = useState<Record<string, Record<string, PredictionSignal>>>({});
  const [loadingPredictions, setLoadingPredictions] = useState(true);
  const [flashSymbol, setFlashSymbol] = useState<Record<string, boolean>>({});

  // Fetch Market Data (Prices & Returns)
  const fetchMarketData = async () => {
    WATCHLIST_SYMBOLS.forEach(async (item) => {
      try {
        setMarketData(prev => ({
          ...prev,
          [item.symbol]: { ...prev[item.symbol], loading: true, error: false }
        }));

        // Fetch daily interval data to compute daily returns
        const res = await api.get(`/market/history`, {
          params: { symbol: item.symbol, interval: '1d', period: '5d' }
        });

        if (res.data && res.data.data && res.data.data.length > 0) {
          const history = res.data.data;
          const latest = history[history.length - 1];
          const previous = history[history.length - 2];
          
          let changePercent = 0;
          if (previous && previous.close) {
            changePercent = ((latest.close - previous.close) / previous.close) * 100;
          } else if (latest.open) {
            changePercent = ((latest.close - latest.open) / latest.open) * 100;
          }

          setMarketData(prev => ({
            ...prev,
            [item.symbol]: {
              ...prev[item.symbol],
              price: latest.close,
              changePercent: changePercent,
              loading: false
            }
          }));
        } else {
          throw new Error("Empty data returned");
        }
      } catch (err) {
        console.error(`Error fetching market data for ${item.symbol}:`, err);
        setMarketData(prev => ({
          ...prev,
          [item.symbol]: { ...prev[item.symbol], loading: false, error: true }
        }));
      }
    });
  };

  // Fetch Predictions for all timeframes
  const fetchPredictions = async () => {
    try {
      setLoadingPredictions(true);
      const res = await api.get('/signals/latest', {
        params: { limit: 100 }
      });

      const grouped: Record<string, Record<string, PredictionSignal>> = {};
      
      // Process starting from oldest to newest so the newest overwrites
      const signals = [...res.data].reverse();
      signals.forEach((sig: any) => {
        if (!grouped[sig.symbol]) {
          grouped[sig.symbol] = {};
        }
        grouped[sig.symbol][sig.timeframe] = {
          symbol: sig.symbol,
          signal: sig.signal,
          confidence: sig.confidence,
          timeframe: sig.timeframe
        };
      });

      setPredictions(grouped);
    } catch (error) {
      console.error("Error fetching signals for heatmap", error);
    } finally {
      setLoadingPredictions(false);
    }
  };

  useEffect(() => {
    fetchMarketData();
    fetchPredictions();
    
    const intervalId = setInterval(fetchMarketData, 60000); // refresh every 60s
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    // Listen for live updates from websocket
    const handleSignalUpdate = (newSignal: any) => {
      setPredictions(prev => {
        const symbolPreds = prev[newSignal.symbol] || {};
        return {
          ...prev,
          [newSignal.symbol]: {
            ...symbolPreds,
            [newSignal.timeframe]: {
              symbol: newSignal.symbol,
              signal: newSignal.signal,
              confidence: newSignal.confidence,
              timeframe: newSignal.timeframe
            }
          }
        };
      });

      // Trigger a visual flash effect to show real-time live update
      setFlashSymbol(prev => ({ ...prev, [newSignal.symbol]: true }));
      const timer = setTimeout(() => {
        setFlashSymbol(prev => ({ ...prev, [newSignal.symbol]: false }));
      }, 1500);
    };

    socket.on('signal_update', handleSignalUpdate);
    return () => {
      socket.off('signal_update', handleSignalUpdate);
    };
  }, []);

  // Determine dominant direction across all timeframes for card background styling
  const getDominantSentiment = (symbol: string) => {
    const symbolPreds = predictions[symbol];
    if (!symbolPreds) return 'NEUTRAL';
    
    let calls = 0;
    let puts = 0;
    
    Object.values(symbolPreds).forEach(pred => {
      if (pred.signal === 'CALL') calls++;
      if (pred.signal === 'PUT') puts++;
    });
    
    if (calls > puts) return 'CALL';
    if (puts > calls) return 'PUT';
    return 'NEUTRAL';
  };

  const getSentimentStyles = (symbol: string) => {
    const dominant = getDominantSentiment(symbol);
    if (dominant === 'CALL') {
      return 'bg-emerald-500/10 border-emerald-500/20 hover:border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.08)]';
    }
    if (dominant === 'PUT') {
      return 'bg-rose-500/10 border-rose-500/20 hover:border-rose-500/50 shadow-[0_0_20px_rgba(239,68,68,0.08)]';
    }
    return 'bg-gray-800/40 border-gray-700/50 hover:border-gray-650 shadow-lg';
  };

  // Render sub-pills for each timeframe prediction
  const renderTimeframeBadge = (symbol: string, tf: string) => {
    const pred = predictions[symbol]?.[tf];
    if (!pred) {
      return (
        <div key={tf} className="bg-gray-900/45 border border-gray-800/60 p-2 rounded-lg text-center flex-1">
          <div className="text-[10px] text-gray-500 font-bold uppercase">{tf}</div>
          <div className="text-xs font-extrabold text-gray-600 mt-1">-</div>
        </div>
      );
    }
    
    const isCall = pred.signal === 'CALL';
    const isPut = pred.signal === 'PUT';
    
    return (
      <div 
        key={tf} 
        className={`p-2 rounded-lg text-center flex-1 border transition-all duration-300 ${
          isCall 
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
            : isPut 
            ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' 
            : 'bg-gray-900/40 border-gray-850 text-gray-500'
        }`}
      >
        <div className={`text-[10px] uppercase font-black tracking-wider ${
          isCall ? 'text-emerald-400/80' : isPut ? 'text-rose-400/80' : 'text-gray-500'
        }`}>
          {tf}
        </div>
        <div className="text-xs font-black tracking-tight mt-1 flex flex-col leading-tight">
          <span>{pred.signal}</span>
          <span className="text-[9px] font-mono font-medium text-gray-400 mt-0.5">
            {pred.confidence.toFixed(0)}%
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="glass-panel p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Market Heatmap
            <span className="text-xs font-normal text-gray-400 bg-gray-900 px-2 py-0.5 rounded-full border border-gray-700 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-primary animate-pulse" /> Multi-Timeframe Sentiment
            </span>
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">Visualizing live market breadth and predictions</p>
        </div>

        <button 
          onClick={() => { fetchMarketData(); fetchPredictions(); }}
          className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white transition-colors"
          title="Refresh Heatmap"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-grow">
        {WATCHLIST_SYMBOLS.map((item) => {
          const data = marketData[item.symbol];
          const sentimentClass = getSentimentStyles(item.symbol);
          const isUp = (data?.changePercent ?? 0) >= 0;

          return (
            <div
              key={item.symbol}
              className={`p-5 rounded-xl border transition-all duration-500 flex flex-col justify-between group ${sentimentClass} ${
                flashSymbol[item.symbol] ? 'ring-2 ring-primary scale-[1.02] shadow-[0_0_20px_rgba(59,130,246,0.3)] bg-gray-800' : ''
              }`}
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-extrabold text-lg text-white group-hover:text-primary transition-colors">
                      {item.name}
                    </h3>
                    <span className="text-[10px] font-mono text-gray-400 bg-gray-900/60 px-2 py-0.5 rounded border border-gray-850">
                      {item.symbol}
                    </span>
                  </div>
                  
                  {/* Daily Change Badge */}
                  {!data.loading && !data.error && data.changePercent !== null && (
                    <div className={`flex items-center gap-1 text-sm font-bold px-2.5 py-0.5 rounded-full ${
                      isUp ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                    }`}>
                      {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      <span>{isUp ? '+' : ''}{data.changePercent.toFixed(2)}%</span>
                    </div>
                  )}
                </div>

                {/* Price Display */}
                <div className="mt-4">
                  {data.loading ? (
                    <div className="h-7 w-28 bg-gray-800/60 animate-pulse rounded"></div>
                  ) : data.error ? (
                    <span className="text-xs text-danger flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Error loading price
                    </span>
                  ) : (
                    <span className="text-2xl font-black text-white font-mono tracking-tight">
                      {data.price?.toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </span>
                  )}
                </div>
              </div>

              {/* Timeframe Predictions Row */}
              <div className="mt-6 pt-4 border-t border-gray-800/40">
                <span className="text-xs font-semibold text-gray-400 block mb-2">AI Predictions:</span>
                {loadingPredictions ? (
                  <div className="grid grid-cols-4 gap-2">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="h-10 bg-gray-800/50 animate-pulse rounded-lg"></div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {TIMEFRAMES.map((tf) => renderTimeframeBadge(item.symbol, tf))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
