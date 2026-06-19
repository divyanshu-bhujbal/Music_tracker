import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <div>Collectio</div>
    </StrictMode>,
  );
} else {
  throw new Error("Root element #root not found in the DOM");
}
