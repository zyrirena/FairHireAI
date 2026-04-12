import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(auth.getStoredUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (auth.isLoggedIn()) {
      auth.getMe()
        .then(u => { setUser(u); })
        .catch(() => { setUser(null); auth.logout(); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const result = await auth.login(email, password);
    setUser(result.user);
    return result;
  };

  const logout = async () => {
    await auth.logout();
    setUser(null);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)' }}>
        <div className="spinner" style={{ width: 32, height: 32 }}></div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isAdmin: user?.role === 'ADMIN' }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
