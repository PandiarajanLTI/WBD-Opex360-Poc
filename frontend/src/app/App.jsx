import { lazy, Suspense } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
const LandingPage = lazy(
  () => import('../features/templates/pages/LandingPage'),
);
const ForecastPage = lazy(
  () => import('../features/forecast/pages/ForecastPage'),
);
const BudgetPage = lazy(() => import('../features/budget/pages/BudgetPage'));
export default function App() {
  const { pathname } = useLocation();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <svg
            className="brand-mark"
            viewBox="0 0 54 56"
            aria-hidden="true"
            focusable="false"
          >
            <path
              className="brand-shield-shadow"
              d="M27 2.8c7.2 0 14.2 2.1 21.3 6.2l-.8 15.1c-.7 12.9-8.8 23.2-20.5 29.1C15.3 47.3 7.2 37 6.5 24.1L5.7 9C12.8 4.9 19.8 2.8 27 2.8Z"
            />
            <path
              className="brand-shield"
              d="M27 4.6c6.1 0 12.7 1.8 19.2 5.4l-.7 13.9c-.6 11.4-7.5 20.8-18.5 26.6C16 44.7 9.1 35.3 8.5 23.9L7.8 10C14.3 6.4 20.9 4.6 27 4.6Z"
            />
            <path
              className="brand-shield-inner"
              d="M27 8.1c5.1 0 10.3 1.4 15.7 4.1l-.5 11.4c-.5 9.2-5.8 16.8-15.2 22-9.4-5.2-14.7-12.8-15.2-22l-.5-11.4C16.7 9.5 21.9 8.1 27 8.1Z"
            />
            <path
              className="brand-monogram"
              d="m14 16 4.4 18.1 4.7 5.1 5.1-8.8 4.8 8.8 4.8-5.1L42 16"
            />
            <path
              className="brand-monogram"
              d="M26.5 14.5v27m0-27h4.8c5 0 8 2 8 5.5s-3 5.5-8 5.5h-4.8m0 0h5.5c5.4 0 8.5 2.2 8.5 6.2s-3.1 6.3-8.5 6.3h-5.5"
            />
          </svg>
          <strong>Opex360</strong>
        </div>
        <div className="profile-display">
          <span>Profile</span>
          <span className="profile-avatar" aria-hidden="true">
            P
          </span>
          <span aria-hidden="true">⌄</span>
        </div>
      </header>
      <nav className="primary-nav" aria-label="Main navigation">
        <span
          className="nav-placeholder"
          aria-disabled="true"
          style={{ display: 'none' }}
        >
          Review &amp; Enrich Actuals
        </span>
        <span
          className="nav-placeholder"
          aria-disabled="true"
          style={{ display: 'none' }}
        >
          Accruals &amp; Reclasses
        </span>
        <span
          className="nav-placeholder"
          aria-disabled="true"
          style={{ display: 'none' }}
        >
          Analyze Variances
        </span>
        <span
          className="nav-placeholder"
          aria-disabled="true"
          style={{ display: 'none' }}
        >
          Reporting
        </span>
        <NavLink
          className={
            pathname === '/' || pathname.startsWith('/templates/')
              ? 'active'
              : ''
          }
          to="/"
        >
          Build Forecasts
        </NavLink>
        <span
          className="nav-placeholder"
          aria-disabled="true"
          style={{ display: 'none' }}
        >
          Track Tasks
        </span>
        <NavLink className="budget-nav-link" to="/budget">
          Budget Mapping
        </NavLink>
      </nav>
      <main>
        <Suspense fallback={<div className="panel">Loading…</div>}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/templates/:templateName" element={<ForecastPage />} />
            <Route path="/budget" element={<BudgetPage />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
