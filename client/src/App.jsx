import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api } from './api';
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import Admin from './pages/Admin';
import MockPayment from './pages/MockPayment';

function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!localStorage.getItem('token'));

  const refresh = async () => {
    if (!localStorage.getItem('token')) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { user: u } = await api.me();
      setUser(u);
    } catch {
      localStorage.removeItem('token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = (token, u) => {
    localStorage.setItem('token', token);
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return { user, loading, login, logout, refresh };
}

function ProtectedRoute({ user, loading, children }) {
  if (loading) return <p className="card">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const auth = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login auth={auth} />} />
      <Route path="/register" element={<Register auth={auth} />} />
      <Route path="/payment/mock" element={<MockPayment auth={auth} />} />
      <Route
        path="/"
        element={
          <ProtectedRoute user={auth.user} loading={auth.loading}>
            <Home auth={auth} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute user={auth.user} loading={auth.loading}>
            {auth.user?.role === 'admin' ? <Admin auth={auth} /> : <Navigate to="/" replace />}
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
