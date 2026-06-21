import { render, screen } from "@testing-library/react";
import App from "../App";

describe("App", () => {
  it("renders heading", () => {
    render(<App />);
    const heading = screen.getByRole("heading", { name: /collectiods/i });
    expect(heading).toBeInTheDocument();
  });
});
