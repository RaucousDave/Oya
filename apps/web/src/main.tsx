import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LandingPage } from "./pages/LandingPage";
import "./styles/tokens.css";
import "./styles/landing.css";
import "./styles/adaptive.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LandingPage />
  </StrictMode>,
);
