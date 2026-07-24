import { Navigate, Outlet } from "react-router-dom";
import { getAccessToken } from "../api/client";

export default function ProtectedRoute() {
  const isAuthed = Boolean(getAccessToken());
  return isAuthed ? <Outlet /> : <Navigate to="/login" replace />;
}