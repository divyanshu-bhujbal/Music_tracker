import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { VerifyRunner } from "@collectio/platform/capacitor/__verify__/VerifyRunner";

const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <VerifyRunner />
    </StrictMode>,
  );
} else {
  throw new Error("Root element #root not found in the DOM");
}
