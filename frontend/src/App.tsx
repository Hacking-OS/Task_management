import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { MediaPreviewProvider } from "./context/MediaPreviewContext";
import { AppRoutes } from "./routes/AppRoutes";
import { ToastViewport } from "./shared/ToastViewport";
import "./styles.css";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <MediaPreviewProvider>
            <AppRoutes />
            <ToastViewport />
          </MediaPreviewProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
