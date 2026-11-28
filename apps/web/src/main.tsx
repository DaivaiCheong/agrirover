import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { FarmFocusProvider } from "./lib/farmContext";
import { queryClient } from "./lib/queries";
import "./styles/theme.css";
import "./styles/app.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <FarmFocusProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </FarmFocusProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
