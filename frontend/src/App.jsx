import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Auth from './Auth';
import Dashboard from './Dashboard';

function App() {
  const [userId, setUserId] = useState(localStorage.getItem('userId'));

  const handleLogin = (id) => {
    localStorage.setItem('userId', id);
    setUserId(id);
  };

  const handleLogout = () => {
    localStorage.removeItem('userId');
    setUserId(null);
  };

  return (
    <BrowserRouter>
      <div style={{ minHeight: '100vh', backgroundColor: '#f4f7f6' }}>
        <Routes>
          <Route
            path="/login"
            element={userId ? <Navigate to="/" replace /> : <Auth onLogin={handleLogin} />}
          />
          <Route
            path="/"
            element={userId ? <Dashboard userId={userId} onLogout={handleLogout} /> : <Navigate to="/login" replace />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
