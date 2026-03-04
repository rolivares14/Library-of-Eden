import { useEffect } from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { Toaster } from "sonner";
import { AuthProvider } from "./contexts/AuthContext";

/**
 * Request persistent storage so the browser never silently evicts
 * our IndexedDB data (uploaded books, cached EPUBs, metadata).
 */
function useRequestPersistentStorage() {
  useEffect(() => {
    (async () => {
      try {
        if (navigator.storage && navigator.storage.persist) {
          const alreadyPersisted = await navigator.storage.persisted();
          if (!alreadyPersisted) {
            const granted = await navigator.storage.persist();
            console.log(
              granted
                ? "[Storage] Persistent storage granted — data will not be evicted."
                : "[Storage] Persistent storage denied — data may be evicted under pressure."
            );
          } else {
            console.log("[Storage] Persistent storage already active.");
          }
        }
      } catch (err) {
        console.warn("[Storage] Could not request persistent storage:", err);
      }
    })();
  }, []);
}

export default function App() {
  useRequestPersistentStorage();

  return (
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster
        position="bottom-center"
        richColors
        theme="dark"
        toastOptions={{
          style: {
            background: "#1a332a",
            color: "#e8f0ec",
            border: "1px solid rgba(45, 90, 69, 0.6)",
            fontSize: "0.95rem",
            padding: "14px 20px",
            boxShadow: "0 4px 24px rgba(0, 0, 0, 0.5)",
          },
        }}
      />
    </AuthProvider>
  );
}