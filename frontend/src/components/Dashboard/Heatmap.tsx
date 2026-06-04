import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { socket } from '../../services/socket';
import { TrendingUp, TrendingDown, Minus, RefreshCw, AlertCircle } from 'lucide-react';

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

export default function Heatmap() {
  const [timeframe, setTimeframe] = useState<string>('1h');
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

  const [predictions, setPredictions] = useState<Record<string, PredictionSignal>>({});
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

  // Fetch Predictions for selected timeframe
  const fetchPredictions = async () => {
    try {
      setLoadingPredictions(true);
      const res = await api.get('/signals/latest', {
        params: { timeframe, limit: 50 }
      });

      const latestSignals: Record<string, PredictionSignal> = {};
      
      // Process starting from oldest to newest so the newest overwrites
      const signals = [...res.data].reverse();
      signals.forEach((sig: any) => {
        latestSignals[sig.symbol] = {
          symbol: sig.symbol,
          signal: sig.signal,
          confidence: sig.confidence,
          timeframe: sig.timeframe
        };
      });

      setPredictions(latestSignals);
    } catch (error) {
      console.error("Error fetching signals for heatmap", error);
    } finally {
      setLoadingPredictions(false);
    }
  };

  useEffect(() => {
    fetchMarketData();
    const intervalId = setInterval(fetchMarketData, 60000); // refresh every 60s
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    fetchPredictions();
  }, [timeframe]);

  useEffect(() => {
    // Listen for live updates from websocket
    const handleSignalUpdate = (newSignal: any) => {
      if (newSignal.timeframe === timeframe) {
        setPredictions(prev => ({
          ...prev,
          [newSignal.symbol]: {
            symbol: newSignal.symbol,
            signal: newSignal.signal,
            confidence: newSignal.confidence,
            timeframe: newSignal.timeframe
          }
        }));

        // Trigger a visual flash effect to show real-time live update
        setFlashSymbol(prev => ({ ...prev, [newSignal.symbol]: true }));
        const timer = setTimeout(() => {
          setFlashSymbol(prev => ({ ...prev, [newSignal.symbol]: false }));
        }, 1500);
      }
    };

    socket.on('signal_update', handleSignalUpdate);
    return () => {
      socket.off('signal_update', handleSignalUpdate);
    };
  }, [timeframe]);

  // Color code helper based on AI sentiment
  const getSentimentStyles = (symbol: string) => {
    const pred = predictions[symbol];
    if (!pred) {
      return 'bg-gray-800/40 border-gray-700/50 hover:border-gray-600/80 shadow-lg';
    }
    if (pred.signal === 'CALL') {
      return 'bg-emerald-500/15 border-emerald-500/30 hover:border-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.15)] text-emerald-400';
    }
    if (pred.signal === 'PUT') {
      return 'bg-rose-500/15 border-rose-500/30 hover:border-rose-500/60 shadow-[0_0_15px_rgba(239,68,68,0.15)] text-rose-400';
    }
    return 'bg-gray-800/40 border-gray-700/50 hover:border-gray-600/80 shadow-lg';
  };

  return (
    <div className="glass-panel p-6 flex flex-col h-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Market Heatmap
            <span className="text-xs font-normal text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700">
              Live Breath
            </span>
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">Visualizing market change & AI prediction sentiment</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Timeframe selector */}
          <div className="flex bg-gray-900/60 p-0.5 rounded-lg border border-gray-800">
            {['15m', '30m', '1h', '1d'].map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  timeframe === tf
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <button 
            onClick={() => { fetchMarketData(); fetchPredictions(); }}
            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white transition-colors"
            title="Refresh Heatmap"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-grow">
        {WATCHLIST_SYMBOLS.map((item) => {
          const data = marketData[item.symbol];
          const pred = predictions[item.symbol];
          const sentimentClass = getSentimentStyles(item.symbol);
          const isUp = (data?.changePercent ?? 0) >= 0;

          return (
            <div
              key={item.symbol}
              className={`p-5 rounded-xl border transition-all duration-500 flex flex-col justify-between group ${sentimentClass} ${
                flashSymbol[item.symbol] ? 'ring-2 ring-primary scale-[1.02] shadow-[0_0_20px_rgba(59,130,246,0.3)]' : ''
              }`}
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-extrabold text-lg text-white group-hover:text-primary transition-colors">
                      {item.name}
                    </h3>
                    <span className="text-xs font-mono text-gray-400 bg-gray-900/40 px-2 py-0.5 rounded border border-gray-800">
                      {item.symbol}
                    </span>
                  </div>
                  
                  {/* Daily Change Badge */}
                  {!data.loading && !data.error && data.changePercent !== null && (
                    <div className={`flex items-center gap-1 text-sm font-bold px-2 py-0.5 rounded-full ${
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
                    <div className="h-7 w-24 bg-gray-800 animate-pulse rounded"></div>
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

              {/* AI Prediction Section */}
              <div className="mt-6 pt-4 border-t border-gray-800/40 flex items-center justify-between text-xs">
                <span className="text-gray-400 font-medium">AI Sentiment ({timeframe}):</span>
                {loadingPredictions ? (
                  <div className="h-5 w-16 bg-gray-800 animate-pulse rounded"></div>
                ) : pred ? (
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full font-extrabold tracking-wide uppercase text-[10px] ${
                      pred.signal === 'CALL' 
                        ? 'bg-emerald-500 text-white' 
                        : pred.signal === 'PUT' 
                        ? 'bg-rose-500 text-white' 
                        : 'bg-gray-700 text-gray-300'
                    }`}>
                      {pred.signal}
                    </span>
                    <span className="font-semibold text-gray-300 font-mono">
                      {pred.confidence.toFixed(1)}% Conf
                    </span>
                  </div>
                ) : (
                  <span className="text-gray-500 italic flex items-center gap-1">
                    <Minus className="w-3.5 h-3.5" /> No active signal
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
