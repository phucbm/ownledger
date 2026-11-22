// After a deploy, a tab opened on the old build asks for page files that no longer exist: reload once to get the new build.
window.addEventListener("vite:preloadError", () => {
  if (sessionStorage.getItem("ownledger.reloaded") === "1") return;
  sessionStorage.setItem("ownledger.reloaded", "1");
  location.reload();
});
window.addEventListener("load", () => setTimeout(() => sessionStorage.removeItem("ownledger.reloaded"), 10000));
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import { I18nProvider } from "@/i18n";
import { queryClient } from "@/lib/api";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <App />
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
);
