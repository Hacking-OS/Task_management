import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LoginPage } from "../../src/pages/LoginPage";

jest.mock("../../src/context/AuthContext", () => ({
  useAuth: () => ({
    login: jest.fn(),
    register: jest.fn(),
  }),
}));

jest.mock("../../src/context/ToastContext", () => ({
  useToast: () => ({ show: jest.fn() }),
}));

jest.mock("../../src/services/api", () => ({
  api: { previewInvitation: jest.fn().mockResolvedValue({ preview: { valid: false } }) },
}));

describe("LoginPage", () => {
  it("renders login form with identifier and password fields", () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByPlaceholderText("yourname or you@company.com")).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
  });
});
