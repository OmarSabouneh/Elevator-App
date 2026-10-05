import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function AdminNav({ current }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  const location = useLocation();

  const currentPath = current || location.pathname;

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const menuItems = [
    {
      to: '/admin',
      label: 'Manage Users',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
      active: currentPath === '/admin' || currentPath === '/admin/',
    },
    {
      to: '/admin/logs',
      label: 'Activity Logs',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ),
      active: currentPath.startsWith('/admin/logs'),
    },
    {
      to: '/',
      label: 'Elevator',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <line x1="12" y1="2" x2="12" y2="22" />
          <polyline points="7 9 9 7 11 9" />
          <polyline points="13 15 15 17 17 15" />
        </svg>
      ),
      active: currentPath === '/',
    },
  ];

  const currentItem = menuItems.find((item) => item.active);

  return (
    <div className="admin-nav-container" ref={dropdownRef}>
      <button
        type="button"
        className={`admin-nav-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label="Admin Navigation Menu"
      >
        <span className="admin-nav-trigger-badge">Admin</span>
        <span className="admin-nav-trigger-label">
          {currentItem ? currentItem.label : 'Menu'}
        </span>
        <svg
          className={`admin-nav-chevron${open ? ' rotated' : ''}`}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="admin-nav-menu" role="menu">
          <div className="admin-nav-header">Admin Navigation</div>
          {menuItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`admin-nav-item${item.active ? ' active' : ''}`}
              onClick={() => setOpen(false)}
              role="menuitem"
            >
              <span className="admin-nav-item-icon">{item.icon}</span>
              <span className="admin-nav-item-text">{item.label}</span>
              {item.active && <span className="admin-nav-item-dot" />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
