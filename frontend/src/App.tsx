import { RouterProvider } from "react-router-dom";
import { router } from "./routes/router";
import NetworkStatusGuard from "./components/NetworkStatusGuard";

function App() {
  return (
    <NetworkStatusGuard>
      <RouterProvider router={router} />
    </NetworkStatusGuard>
  );
}

export default App;