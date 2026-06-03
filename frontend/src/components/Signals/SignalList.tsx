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
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch initial signals
    const fetchSignals = async () => {
      try {
        const res = await api.get('/signals/latest?limit=10');
        setSignals(res.data);
      } catch (error) {
        console.error("Error fetching signals", error);
      } finally {
        setLoading(false);
      }
    };
    fetchSignals();

    // Listen for real-time updates
    socket.on('signal_update', (newSignal: Signal) => {
      setSignals((prev) => [newSignal, ...prev].slice(0, 10));
    });

    return () => {
      socket.off('signal_update');
    };
  }, []);

  if (loading) return <div className="p-4 text-center">Loading signals...</div>;

  return (
    <div className="glass-panel p-6">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        Live AI Signals <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-success"></span></span>
      </h2>
      <div className="space-y-4">
        {signals.map((sig) => (
          <div key={sig._id} className="p-4 rounded-lg bg-gray-800 flex items-center justify-between hover:bg-gray-750 transition-colors border border-gray-700">
            <div className="flex items-center gap-4">
              {sig.signal === 'CALL' ? (
                <ArrowUpCircle className="text-success w-8 h-8" />
              ) : sig.signal === 'PUT' ? (
                <ArrowDownCircle className="text-danger w-8 h-8" />
              ) : (
                <MinusCircle className="text-gray-400 w-8 h-8" />
              )}
              <div>
                <h3 className="font-bold text-lg">{sig.symbol}</h3>
                <p className="text-sm text-gray-400">{sig.timeframe} timeframe</p>
              </div>
            </div>
            <div className="text-right">
              <div className="font-semibold text-lg">
                Conf: <span className={sig.confidence > 75 ? 'text-success' : 'text-warning'}>{sig.confidence.toFixed(1)}%</span>
              </div>
              <div className="text-sm text-gray-300">
                Entry: {sig.entry?.toFixed(2)} | Target: {sig.target?.toFixed(2)} | SL: {sig.stop_loss?.toFixed(2)}
              </div>
            </div>
          </div>
        ))}
        {signals.length === 0 && (
          <div className="text-center text-gray-400 py-8">No recent signals found.</div>
        )}
      </div>
    </div>
  );
}
