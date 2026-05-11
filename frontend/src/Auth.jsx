import React, { useState } from 'react';
import api from './api/client';
import logo from './assets/logo1.png';
import bgImage from './assets/auth-bg.jpg';

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
    <div style={{...styles.container, backgroundImage: `url(${bgImage})`}}>
      <div style={styles.card}>
        <img src={logo} alt="SmartCrop Logo" style={styles.logo} />
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
          <p style={{ ...styles.message, color: isError ? 'var(--color-accent-mulberry)' : 'var(--color-green-signal)' }}>
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
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  },
  card: {
    background: 'rgba(248, 244, 255, 0.9)',
    padding: '40px',
    borderRadius: '16px',
    backdropFilter: 'blur(10px)',
    boxShadow: '0 15px 35px rgba(36, 41, 44, 0.2)',
    width: '350px',
    textAlign: 'center'
  },
  logo: {
    width: '120px',
    marginBottom: '20px'
  },
  title: {
    fontFamily: 'var(--font-heading)',
    color: 'var(--color-green-primary)',
    marginBottom: '20px'
  },
  form: {
    display: 'flex',
    flexDirection: 'column'
  },
  input: {
    padding: '12px',
    marginBottom: '15px',
    borderRadius: '8px',
    border: '1px solid var(--color-accent-soil)',
    backgroundColor: '#fff',
    color: 'var(--color-accent-chernozem)'
  },
  button: {
    padding: '12px',
    background: 'var(--color-green-signal)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
    transition: '0.3s'
  },
  switch: {
    marginTop: '20px',
    color: 'var(--color-green-primary)',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500'
  },
  message: {
    marginTop: '15px',
    fontSize: '14px',
    fontWeight: '600'
  }
};

export default Auth;