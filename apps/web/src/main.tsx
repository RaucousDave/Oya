import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PaymentShell } from "./components/PaymentShell";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage, RequireMerchant } from "./pages/LoginPage";
import { MerchantPaymentPage } from "./pages/MerchantPaymentPage";
import { NewPaymentPage } from "./pages/NewPaymentPage";
import { PaymentPage } from "./pages/PaymentPage";
import { RequestError } from "./lib/api";
import "./styles/tokens.css";
import "./styles/landing.css";
import "./styles/adaptive.css";
import "./styles/payments.css";

const LandingPage = lazy(() => import("./pages/LandingPage").then((module) => ({ default: module.LandingPage })));

const client = new QueryClient({
  defaultOptions: { queries: { retry: (count, error) => count < 1 && !(error instanceof RequestError && error.statusCode < 500) } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Suspense fallback={<p role="status">Loading Oya…</p>}><LandingPage /></Suspense>} />
          <Route element={<PaymentShell />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/pay/:paymentId" element={<PaymentPage />} />
            <Route element={<RequireMerchant />}>
              <Route path="/payments/new" element={<NewPaymentPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/dashboard/payments/:paymentId" element={<MerchantPaymentPage />} />
            </Route>
            <Route path="*" element={<section className="product-card"><h1>Page not found</h1><Link to="/">Go to Oya home</Link></section>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
