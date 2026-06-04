import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import { api } from '../../services/api';

export default function AdvancedChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any | null>(null);
  const candlestickSeriesRef = useRef<any | null>(null);
  const [symbol, setSymbol] = useState("^NSEI");
  const [timeframe, setTimeframe] = useState("1d");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Initialize chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#111827' },
        textColor: '#D1D5DB',
      },
      grid: {
        vertLines: { color: '#1F2937' },
        horzLines: { color: '#1F2937' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 550,
    });
    
    chartRef.current = chart;

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#10B981',
      downColor: '#EF4444',
      borderVisible: false,
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
    });
    
    candlestickSeriesRef.current = candlestickSeries;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // Fetch data
  useEffect(() => {
    const fetchChartAndSignals = async () => {
      if (!candlestickSeriesRef.current) return;
      setLoading(true);
      try {
        // 1. Determine period based on timeframe
        let period = "1y";
        if (timeframe === "15m" || timeframe === "30m") period = "30d";
        else if (timeframe === "1h") period = "3mo";
        
        // 2. Fetch market history
        const res = await api.get(`/market/history?symbol=${symbol}&interval=${timeframe}&period=${period}`);
        const formattedData = res.data.data.map((d: any) => ({
          time: new Date(d.timestamp).getTime() / 1000,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        }));
        
        // Sort data by time ascending
        formattedData.sort((a: any, b: any) => a.time - b.time);
        candlestickSeriesRef.current.setData(formattedData);
        chartRef.current?.timeScale().fitContent();

        // 3. Fetch latest prediction signals for the symbol and timeframe
        const sigRes = await api.get(`/signals/latest`, {
          params: { symbol: symbol, timeframe: timeframe, limit: 100 }
        });
        
        const signals = sigRes.data || [];
        const markers: any[] = [];
        
        signals.forEach((sig: any) => {
          if (sig.signal === "NO TRADE") return;
          const sigTime = new Date(sig.created_at).getTime() / 1000;
          
          // Find the closest candle
          let closestCandle = null;
          let minDiff = Infinity;
          
          formattedData.forEach((candle: any) => {
            const diff = Math.abs(candle.time - sigTime);
            if (diff < minDiff) {
              minDiff = diff;
              closestCandle = candle;
            }
          });
          
          // Define timeframe-specific tolerance to match signals
          let tolerance = 900;
          if (timeframe === '30m') tolerance = 1800;
          if (timeframe === '1h') tolerance = 3600;
          if (timeframe === '1d') tolerance = 86400;
          
          // Allow up to 3x spacing for signal alignment
          if (closestCandle && minDiff <= tolerance * 3) {
            // Check if marker at this time already exists to avoid overlapping
            const exists = markers.some(m => m.time === closestCandle.time);
            if (!exists) {
              markers.push({
                time: closestCandle.time,
                position: sig.signal === 'CALL' ? 'belowBar' : 'aboveBar',
                color: sig.signal === 'CALL' ? '#10B981' : '#EF4444',
                shape: sig.signal === 'CALL' ? 'arrowUp' : 'arrowDown',
                text: `${sig.signal} @ ${sig.entry ? sig.entry.toFixed(1) : ''} (${sig.confidence.toFixed(0)}%)`,
                size: 1.2,
              });
            }
          }
        });
        
        markers.sort((a, b) => a.time - b.time);
        candlestickSeriesRef.current.setMarkers(markers);
      } catch (error) {
        console.error("Failed to load chart or signals:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchChartAndSignals();
  }, [symbol, timeframe]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">Advanced Charts</h1>
          <p className="text-gray-400">Technical analysis with ML ensemble signal overlays.</p>
        </div>
        <div className="flex flex-wrap gap-4 items-center">
          {/* Timeframe selector pills */}
          <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-700">
            {['15m', '30m', '1h', '1d'].map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase transition-all duration-200 ${
                  timeframe === tf
                    ? 'bg-primary text-white shadow-md'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                }`}
              >
                {tf === '15m' ? '15 Min' : tf === '30m' ? '30 Min' : tf === '1h' ? '1 Hour' : 'Daily'}
              </button>
            ))}
          </div>

          <div className="flex gap-2 items-center">
            <label className="text-sm font-semibold text-gray-300">Symbol:</label>
            <select 
              className="bg-gray-800 border border-gray-700 rounded-md p-2 outline-none focus:border-primary transition-colors text-sm font-bold"
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
      </header>

      <div className="glass-panel p-2 relative">
        {loading && (
          <div className="absolute inset-0 bg-black/60 z-10 flex items-center justify-center rounded-xl">
            <span className="text-lg font-bold text-primary animate-pulse">Loading Chart & Signals Overlay...</span>
          </div>
        )}
        <div ref={chartContainerRef} className="w-full rounded-lg overflow-hidden" />
      </div>
    </div>
  );
}
