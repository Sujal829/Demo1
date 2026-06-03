import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';
import { api } from '../../services/api';

export default function AdvancedChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [symbol, setSymbol] = useState("^NSEI");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Initialize chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#1A2235' },
        textColor: '#D9D9D9',
      },
      grid: {
        vertLines: { color: '#2B3548' },
        horzLines: { color: '#2B3548' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 600,
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
    const fetchChartData = async () => {
      if (!candlestickSeriesRef.current) return;
      setLoading(true);
      try {
        const res = await api.get(`/market/history?symbol=${symbol}&interval=1d&period=6mo`);
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
      } catch (error) {
        console.error("Failed to load chart data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchChartData();
  }, [symbol]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Advanced Charts</h1>
          <p className="text-gray-400">Technical analysis with ML overlay.</p>
        </div>
        <div className="flex gap-4 items-center">
          <label className="text-sm font-semibold">Symbol:</label>
          <select 
            className="bg-gray-800 border border-gray-700 rounded-md p-2 outline-none focus:border-primary transition-colors"
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
      </header>

      <div className="glass-panel p-2 relative">
        {loading && (
          <div className="absolute inset-0 bg-black/50 z-10 flex items-center justify-center rounded-xl">
            <span className="text-lg font-bold text-primary animate-pulse">Loading Market Data...</span>
          </div>
        )}
        <div ref={chartContainerRef} className="w-full rounded-lg overflow-hidden" />
      </div>
    </div>
  );
}
