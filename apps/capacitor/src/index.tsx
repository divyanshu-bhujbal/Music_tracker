import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthVerifyRunner } from "@collectio/platform/capacitor/__verify__/AuthVerifyRunner";

const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <AuthVerifyRunner />
    </StrictMode>,
  );
} else {
  throw new Error("Root element #root not found in the DOM");
}
