import React, { useState } from 'react';
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
    <div className="App" style={{ minHeight: '100vh', backgroundColor: '#f4f7f6' }}>
      {!userId ? (
        <Auth onLogin={handleLogin} />
      ) : (
        <Dashboard userId={userId} onLogout={handleLogout} />
      )}
    </div>
  );
}

export default App;