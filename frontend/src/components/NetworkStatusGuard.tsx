import { useEffect, useState, type ReactNode } from "react";
import OfflinePage from "../pages/OfflinePage";

export default function NetworkStatusGuard({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (!isOnline) return <OfflinePage />;
  return <>{children}</>;
}