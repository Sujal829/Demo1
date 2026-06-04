import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard/Dashboard';
import AdvancedChart from './pages/Trading/AdvancedChart';
import { useEffect, useState } from 'react';
import { connectSocket, disconnectSocket, socket } from './services/socket';
import { Wifi, WifiOff } from 'lucide-react';

function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);

  useEffect(() => {
    connectSocket();

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    // Initial check
    setIsConnected(socket.connected);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      disconnectSocket();
    };
  }, []);

  return (
    <Router>
      <div className="min-h-screen bg-background text-white font-sans">
        <nav className="border-b border-gray-800 bg-card p-4">
          <div className="container mx-auto flex gap-6 items-center">
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-success">
              Trading AI
            </h1>
            <div className="flex gap-4">
              <a href="/" className="hover:text-primary transition-colors">Dashboard</a>
              <a href="/chart" className="hover:text-primary transition-colors">Advanced Chart</a>
            </div>
            
            {/* Live Connection Indicator */}
            <div className="ml-auto flex items-center gap-2">
              {isConnected ? (
                <span className="flex items-center gap-1.5 text-xs font-bold text-success bg-success/10 px-3 py-1 rounded-full border border-success/30">
                  <Wifi className="w-3.5 h-3.5" /> WebSocket Live
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-bold text-danger bg-danger/10 px-3 py-1 rounded-full border border-danger/30 animate-pulse">
                  <WifiOff className="w-3.5 h-3.5" /> Offline
                </span>
              )}
            </div>
          </div>
        </nav>
        <main className="container mx-auto p-4 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/chart" element={<AdvancedChart />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
