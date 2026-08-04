import { Navigate, Outlet } from "react-router-dom";
import { getStoredItem } from "../utils/storage";

interface RoleRouteProps {
  allowedRole: "doctor" | "pathologist";
}

export default function RoleRoute({ allowedRole }: RoleRouteProps) {
  const userRole = getStoredItem("user_role");

  if (userRole !== allowedRole) {
    const redirectTo = userRole === "doctor" ? "/doctor-dashboard" : "/";
    return <Navigate to={redirectTo} replace />;
  }

  return <Outlet />;
}
