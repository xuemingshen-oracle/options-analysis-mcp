import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { applyThemePreference, loadThemePreference } from "./preferences";
import "./styles.css";

try {
  applyThemePreference(
    document.documentElement,
    loadThemePreference(window.localStorage),
  );
} catch {
  // Some browser policies throw while accessing localStorage itself.
  applyThemePreference(document.documentElement, "system");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
