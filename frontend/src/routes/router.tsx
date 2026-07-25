// jch
import { createBrowserRouter } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import PathologistLayout from "../layouts/PathologistLayout";
import LoginPage from "../pages/LoginPage";
import SignupPage from "../pages/SignupPage";
import CaseListPage from "../pages/CaseListPage";
import UploadPage from "../pages/UploadPage";
import Dashboard from "../pages/Doctor_Dashboard"; // jgy

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/signup", element: <SignupPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <PathologistLayout />,
        children: [
          { path: "/", element: <CaseListPage /> },
          { path: "/upload", element: <UploadPage /> },
        ],
      },
      { path: "/doctor-dashboard", element: <Dashboard /> }, // jgy
    ],
  },
]);
// 강연님