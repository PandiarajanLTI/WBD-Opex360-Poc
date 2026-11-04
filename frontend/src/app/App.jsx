import { lazy, Suspense } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
const LandingPage = lazy(
  () => import('../features/templates/pages/LandingPage'),
);
const ForecastPage = lazy(
  () => import('../features/forecast/pages/ForecastPage'),
);
const BudgetPage = lazy(() => import('../features/budget/pages/BudgetPage'));
export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            W
          </span>
          <strong>Opex360</strong>
          <span className="brand-divider" aria-hidden="true" />
          <span>FP&A and R2R</span>
        </div>
        <span className="header-context">Finance workspace</span>
      </header>
      <nav className="primary-nav" aria-label="Main navigation">
        <NavLink end to="/">
          Build Forecasts
        </NavLink>
        <NavLink to="/budget">Budget Mapping</NavLink>
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
