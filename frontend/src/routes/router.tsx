// jch
import { createBrowserRouter } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import LoginPage from "../pages/LoginPage";
import SignupPage from "../pages/SignupPage";
import CaseListPage from "../pages/CaseListPage";
import CaseDetailPage from "../pages/CaseDetailPage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/signup", element: <SignupPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: "/", element: <CaseListPage /> },
      { path: "/cases/:id", element: <CaseDetailPage /> },
    ],
  },
]);
// 강연님
