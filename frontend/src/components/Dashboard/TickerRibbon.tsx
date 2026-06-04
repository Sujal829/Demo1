import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { socket } from '../../services/socket';
import { TrendingUp, TrendingDown, Sparkles } from 'lucide-react';

interface TickerItem {
  symbol: string;
  name: string;
  price: number | null;
  changePercent: number | null;
  sentiment: 'CALL' | 'PUT' | 'NEUTRAL';
}

const TICKER_SYMBOLS = [
  { symbol: '^NSEI', name: 'NIFTY 50' },
  { symbol: '^BSESN', name: 'BSE SENSEX' },
  { symbol: 'RELIANCE.NS', name: 'RELIANCE' },
  { symbol: 'HDFCBANK.NS', name: 'HDFC BANK' }
];

export default function TickerRibbon() {
  const [items, setItems] = useState<TickerItem[]>(() =>
    TICKER_SYMBOLS.map(t => ({
      symbol: t.symbol,
      name: t.name,
      price: null,
      changePercent: null,
      sentiment: 'NEUTRAL'
    }))
  );

  const fetchTickerData = async () => {
    try {
      // 1. Fetch market data
      const updated = await Promise.all(
        TICKER_SYMBOLS.map(async (item) => {
          let price = null;
          let changePercent = null;
          try {
            const res = await api.get(`/market/history`, {
              params: { symbol: item.symbol, interval: '1d', period: '5d' }
            });
            if (res.data && res.data.data && res.data.data.length > 0) {
              const history = res.data.data;
              const latest = history[history.length - 1];
              const previous = history[history.length - 2];
              price = latest.close;
              if (previous && previous.close) {
                changePercent = ((latest.close - previous.close) / previous.close) * 100;
              }
            }
          } catch (e) {
            console.error(`Error loading ticker details for ${item.symbol}`, e);
          }
          return { symbol: item.symbol, name: item.name, price, changePercent };
        })
      );

      // 2. Fetch predictions to calculate sentiment
      const sigRes = await api.get('/signals/latest', { params: { limit: 50 } });
      const predictions = sigRes.data || [];

      // Calculate sentiment per symbol
      const sentimentMap: Record<string, 'CALL' | 'PUT' | 'NEUTRAL'> = {};
      TICKER_SYMBOLS.forEach(t => {
        const symPreds = predictions.filter((p: any) => p.symbol === t.symbol);
        let calls = 0;
        let puts = 0;
        symPreds.forEach((p: any) => {
          if (p.signal === 'CALL') calls++;
          if (p.signal === 'PUT') puts++;
        });
        if (calls > puts) sentimentMap[t.symbol] = 'CALL';
        else if (puts > calls) sentimentMap[t.symbol] = 'PUT';
        else sentimentMap[t.symbol] = 'NEUTRAL';
      });

      setItems(
        updated.map(u => ({
          ...u,
          sentiment: sentimentMap[u.symbol] || 'NEUTRAL'
        }))
      );
    } catch (err) {
      console.error('Error fetching ticker ribbon data:', err);
    }
  };

  useEffect(() => {
    fetchTickerData();
    const interval = setInterval(fetchTickerData, 30000); // 30s update

    // Listen to WebSocket events to update sentiment dynamically
    const handleSignalUpdate = () => {
      fetchTickerData();
    };
    socket.on('signal_update', handleSignalUpdate);

    return () => {
      clearInterval(interval);
      socket.off('signal_update', handleSignalUpdate);
    };
  }, []);

  // Duplicate items array to make marquee seamless
  const marqueeItems = [...items, ...items, ...items, ...items];

  return (
    <div className="w-full bg-[#111827]/85 border-b border-gray-800/80 backdrop-blur-md overflow-hidden py-2.5 relative flex items-center h-11">
      {/* Glow highlight */}
      <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-[#111827] to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-[#111827] to-transparent z-10 pointer-events-none" />

      {/* Marquee Inner Container */}
      <div className="flex animate-marquee whitespace-nowrap items-center hover:[animation-play-state:paused] cursor-pointer">
        {marqueeItems.map((item, index) => {
          const isUp = (item.changePercent ?? 0) >= 0;
          return (
            <div
              key={`${item.symbol}-${index}`}
              className="inline-flex items-center mx-8 gap-3 border-r border-gray-800/50 pr-8 text-sm"
            >
              <span className="font-extrabold text-gray-200 group-hover:text-primary tracking-tight">
                {item.name}
              </span>
              
              {item.price !== null ? (
                <span className="font-mono font-bold text-white">
                  {item.price.toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </span>
              ) : (
                <span className="text-gray-600 font-mono">--</span>
              )}

              {item.changePercent !== null ? (
                <span
                  className={`inline-flex items-center gap-0.5 font-bold font-mono text-xs ${
                    isUp ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {isUp ? '+' : ''}
                  {item.changePercent.toFixed(2)}%
                </span>
              ) : (
                <span className="text-gray-600 font-mono">--</span>
              )}

              {/* AI Prediction Indicator */}
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border transition-all duration-300 ${
                  item.sentiment === 'CALL'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
                    : item.sentiment === 'PUT'
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-400 shadow-[0_0_10px_rgba(239,68,68,0.1)]'
                    : 'bg-gray-800/50 border-gray-700 text-gray-400'
                }`}
              >
                <Sparkles className="w-2.5 h-2.5" />
                AI: {item.sentiment}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
