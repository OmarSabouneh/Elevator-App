import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api } from './api';
import Login from './pages/Login';
import Home from './pages/Home';
import Admin from './pages/Admin';
import AdminLogs from './pages/AdminLogs';

function useAuth() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(() => {
    return !!localStorage.getItem('token') && !localStorage.getItem('user');
  });

  const refresh = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { user: u } = await api.me();
      localStorage.setItem('user', JSON.stringify(u));
      setUser(u);
    } catch (err) {
      // ONLY invalidate session if server explicitly returned 401 Unauthorized or 404
      if (err.status === 401 || err.status === 404) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
      }
      // If network error, offline, or temporary 5xx, do NOT log out!
      // The user stays authenticated with cached credentials and token.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();

    const onOnline = () => {
      refresh();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  const login = (token, u) => {
    localStorage.setItem('token', token);
    if (u) {
      localStorage.setItem('user', JSON.stringify(u));
    }
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return { user, loading, login, logout, refresh };
}

function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(() => typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const setOnline = () => setIsOnline(true);
    const setOffline = () => setIsOnline(false);

    window.addEventListener('online', setOnline);
    window.addEventListener('offline', setOffline);
    return () => {
      window.removeEventListener('online', setOnline);
      window.removeEventListener('offline', setOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="offline-banner" role="status">
      <span>Offline mode &bull; Credentials saved</span>
    </div>
  );
}

function ProtectedRoute({ user, loading, children }) {
  if (loading) return <p className="card">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const auth = useAuth();

  return (
    <>
      <OfflineBanner />
      <Routes>
        <Route path="/login" element={<Login auth={auth} />} />
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
      <Route
        path="/admin/logs"
        element={
          <ProtectedRoute user={auth.user} loading={auth.loading}>
            {auth.user?.role === 'admin' ? <AdminLogs auth={auth} /> : <Navigate to="/" replace />}
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </>
);
}
