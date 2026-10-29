import React from "react";
import ReactDOM from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// The window starts hidden and is shown once the app has painted, so it never opens blank and white.
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    if (isTauri()) void getCurrentWindow().show();
  }),
);
