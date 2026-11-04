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
          <span className="brand-mark" aria-hidden="true">
            W
          </span>
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
        <span className="nav-placeholder" aria-disabled="true">
          Review &amp; Enrich Actuals
        </span>
        <span className="nav-placeholder" aria-disabled="true">
          Accruals &amp; Reclasses
        </span>
        <span className="nav-placeholder" aria-disabled="true">
          Analyze Variances
        </span>
        <span className="nav-placeholder" aria-disabled="true">
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
        <span className="nav-placeholder" aria-disabled="true">
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
