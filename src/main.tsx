import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { validateEnv } from "./lib/env";
import { initSentry } from "./lib/sentry";
import App from "./App.tsx";
import "./globals.css";

validateEnv();
initSentry();

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
