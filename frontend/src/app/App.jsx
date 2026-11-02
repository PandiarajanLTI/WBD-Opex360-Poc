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
      <header>
        <strong>Opex360</strong>
        <span>AG Grid POC</span>
      </header>
      <aside>
        <NavLink to="/">Forecasts</NavLink>
        <NavLink to="/budget">Budget</NavLink>
      </aside>
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
