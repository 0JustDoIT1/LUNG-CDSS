import { createBrowserRouter } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import PathologistLayout from "../layouts/PathologistLayout";
import LoginPage from "../pages/LoginPage";
import SignupPage from "../pages/SignupPage";
import CaseListPage from "../pages/CaseListPage";
import UploadPage from "../pages/UploadPage";
import AnalysisPage from "../pages/AnalysisPage";
import Dashboard from "../pages/Doctor_Dashboard";
import NotFoundPage from "../pages/NotFoundPage";
import ErrorPage from "../pages/ErrorPage";

export const router = createBrowserRouter([
  {
    errorElement: <ErrorPage />,
    children: [
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
              { path: "/analysis/:id", element: <AnalysisPage /> },
            ],
          },
          { path: "/doctor-dashboard", element: <Dashboard /> },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);