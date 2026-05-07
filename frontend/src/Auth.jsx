import React, { useState } from 'react';
import api from './api/client';

const Auth = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const url = isLogin ? '/api/v1/auth/login' : '/api/v1/auth/register';

    try {
      const response = await api.post(url, { username, password });
      setIsError(false);

      if (isLogin) {
        if (response.data.user_id) {
          onLogin(response.data.user_id);
        }
      } else {
        setMessage('Account created! Now you can sign in.');
        setIsLogin(true);
      }
    } catch (error) {
      setIsError(true);
      setMessage(error.response?.data?.detail || 'Server error');
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>{isLogin ? 'Sign In' : 'Create Account'}</h2>
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={styles.input}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
          />
          <button type="submit" style={styles.button} disabled={!username || !password}>
            {isLogin ? 'Login' : 'Register'}
          </button>
        </form>
        <p style={styles.switch} onClick={() => { setIsLogin(!isLogin); setMessage(''); }}>
          {isLogin ? "Don't have an account? Register" : 'Already have an account? Login'}
        </p>
        {message && (
          <p style={{ ...styles.message, color: isError ? '#e74c3c' : '#2ecc71' }}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
};

const styles = {
  container: {
    height: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: 'linear-gradient(135deg, #e8f5e9, #c8e6c9)',
    color: '#222'
  },

  card: {
    background: '#fff',
    padding: '30px',
    borderRadius: '12px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
    width: '320px',
    textAlign: 'center',
    color: '#222'
  },

  title: {
    marginBottom: '20px',
    color: '#2e7d32'
  },

  form: {
    display: 'flex',
    flexDirection: 'column'
  },

  input: {
    padding: '10px',
    marginBottom: '12px',
    borderRadius: '6px',
    border: '1px solid #ccc',
    color: '#222'
  },

  button: {
    padding: '12px',
    background: '#43a047',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold'
  },

  switch: {
    marginTop: '15px',
    color: '#388e3c',
    cursor: 'pointer',
    fontSize: '14px'
  },

  message: {
    marginTop: '15px',
    fontSize: '14px'
  }
};

export default Auth;