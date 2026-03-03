import { RouterProvider } from "react-router";
import { router } from "./routes";
import { Toaster } from "sonner";
import { AuthProvider } from "./contexts/AuthContext";

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster
        position="bottom-center"
        richColors
        theme="dark"
        toastOptions={{
          style: {
            background: '#1a332a',
            color: '#e8f0ec',
            border: '1px solid rgba(45, 90, 69, 0.6)',
            fontSize: '0.95rem',
            padding: '14px 20px',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.5)',
          },
        }}
      />
    </AuthProvider>
  );
}
