/**
 * Entry point (WP11): React 19 `createRoot` into `#root` (see `index.html`,
 * which carries the pre-app boot shell this render replaces).
 */
import { createRoot } from "react-dom/client";

import "./theme.css";
import { App } from "./App.js";

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("index.html must provide a #root element");
}

createRoot(rootElement).render(<App />);
