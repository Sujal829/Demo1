import { useEffect, useState } from 'react';
import { socket } from '../../services/socket';
import { api } from '../../services/api';
import { ArrowUpCircle, ArrowDownCircle, MinusCircle } from 'lucide-react';

interface Signal {
  _id: string;
  symbol: string;
  signal: string;
  confidence: number;
  entry: number;
  target: number;
  stop_loss: number;
  timeframe: string;
}

export default function SignalList() {
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('All');
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [flashSignalId, setFlashSignalId] = useState<string | null>(null);

  // Fetch signals on mount and whenever selectedTimeframe changes
  useEffect(() => {
    const fetchSignals = async () => {
      try {
        setLoading(true);
        const url = selectedTimeframe === 'All'
          ? '/signals/latest?limit=20'
          : `/signals/latest?timeframe=${selectedTimeframe}&limit=20`;
        const res = await api.get(url);
        setSignals(res.data);
      } catch (error) {
        console.error("Error fetching signals", error);
      } finally {
        setLoading(false);
      }
    };
    fetchSignals();
  }, [selectedTimeframe]);

  // Handle Socket.io real-time updates
  useEffect(() => {
    const handleSignalUpdate = (newSignal: Signal) => {
      if (selectedTimeframe === 'All' || newSignal.timeframe === selectedTimeframe) {
        setSignals((prev) => {
          // Avoid duplicate signals
          if (prev.some(s => s._id === newSignal._id)) return prev;
          setFlashSignalId(newSignal._id);
          setTimeout(() => setFlashSignalId(null), 2000);
          return [newSignal, ...prev].slice(0, 20);
        });
      }
    };

    socket.on('signal_update', handleSignalUpdate);
    return () => {
      socket.off('signal_update', handleSignalUpdate);
    };
  }, [selectedTimeframe]);

  return (
    <div className="glass-panel p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          Live AI Signals 
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
          </span>
        </h2>
      </div>

      {/* Timeframe Filter Pills */}
      <div className="flex bg-gray-900/60 p-0.5 rounded-lg border border-gray-850 mb-5 self-start">
        {['All', '15m', '30m', '1h', '1d'].map((tf) => (
          <button
            key={tf}
            onClick={() => setSelectedTimeframe(tf)}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
              selectedTimeframe === tf
                ? 'bg-primary text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tf}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex-grow flex items-center justify-center py-12 text-gray-400">
          <span className="animate-pulse">Loading signals...</span>
        </div>
      ) : (
        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
          {signals.map((sig) => {
            const isIndian = sig.symbol.endsWith('.NS') || sig.symbol.startsWith('^');
            const currency = isIndian ? '₹' : '$';
            const baseCapital = isIndian ? 100000 : 10000;
            
            // Sizing: 1.5% to 4% of capital based on prediction confidence
            let allocPercent = 0.02;
            if (sig.confidence > 80) allocPercent = 0.04;
            else if (sig.confidence > 70) allocPercent = 0.025;
            else allocPercent = 0.015;
            
            const tradeAmount = baseCapital * allocPercent;
            
            // Expected profit when target amount is reached
            let expectedProfit = 0;
            if (sig.entry && sig.target) {
              const diffPercent = Math.abs(sig.target - sig.entry) / sig.entry;
              expectedProfit = tradeAmount * diffPercent;
            } else {
              expectedProfit = tradeAmount * 0.01;
            }

            const getHoldDuration = (tf: string) => {
              if (tf === '15m') return '15 Min';
              if (tf === '30m') return '30 Min';
              if (tf === '1h') return '1 Hour';
              if (tf === '1d') return '1 Day';
              return tf;
            };

            return (
              <div 
                key={sig._id} 
                className={`p-4 rounded-lg bg-gray-800/60 hover:bg-gray-750 transition-all duration-500 border flex flex-col gap-3.5 ${
                  flashSignalId === sig._id 
                    ? 'border-primary ring-1 ring-primary bg-primary/5 scale-[1.01]' 
                    : 'border-gray-750'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {sig.signal === 'CALL' ? (
                      <ArrowUpCircle className="text-success w-8 h-8 flex-shrink-0" />
                    ) : sig.signal === 'PUT' ? (
                      <ArrowDownCircle className="text-danger w-8 h-8 flex-shrink-0" />
                    ) : (
                      <MinusCircle className="text-gray-400 w-8 h-8 flex-shrink-0" />
                    )}
                    <div>
                      <h3 className="font-extrabold text-white text-md">{sig.symbol}</h3>
                      <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-gray-400 bg-gray-900/40 px-2 py-0.5 rounded border border-gray-850">
                        {sig.timeframe}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-sm text-gray-200">
                      Conf: <span className={sig.confidence > 75 ? 'text-success' : 'text-warning'}>{sig.confidence.toFixed(1)}%</span>
                    </div>
                    <div className="text-[11px] text-gray-400 font-mono mt-1">
                      E: {sig.entry?.toFixed(2)} | T: {sig.target?.toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Trade execution advice row */}
                {sig.signal !== 'NO TRADE' && (
                  <div className="grid grid-cols-3 gap-2 text-center text-[10px] text-gray-400 bg-gray-900/40 p-2 rounded-lg border border-gray-850">
                    <div>
                      <span className="block text-gray-500 font-semibold mb-0.5">Rec. Position</span>
                      <span className="font-extrabold text-white font-mono">
                        {currency}{tradeAmount.toLocaleString(isIndian ? 'en-IN' : 'en-US', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div>
                      <span className="block text-gray-500 font-semibold mb-0.5">Time Duration</span>
                      <span className="font-extrabold text-white font-mono">
                        {getHoldDuration(sig.timeframe)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-gray-500 font-semibold mb-0.5">Expected Profit</span>
                      <span className="font-extrabold text-success font-mono">
                        +{currency}{expectedProfit.toLocaleString(isIndian ? 'en-IN' : 'en-US', { maximumFractionDigits: 1 })}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {signals.length === 0 && (
            <div className="text-center text-gray-400 py-12">
              No recent signals found for {selectedTimeframe}.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
