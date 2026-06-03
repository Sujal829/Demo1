import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard/Dashboard';
import AdvancedChart from './pages/Trading/AdvancedChart';
import { useEffect } from 'react';
import { connectSocket, disconnectSocket } from './services/socket';

function App() {
  useEffect(() => {
    connectSocket();
    return () => {
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
