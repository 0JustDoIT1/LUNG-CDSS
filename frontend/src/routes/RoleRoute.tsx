import { Navigate, Outlet } from "react-router-dom";

interface RoleRouteProps {
  allowedRole: "doctor" | "pathologist";
}

export default function RoleRoute({ allowedRole }: RoleRouteProps) {
  const userRole = localStorage.getItem("user_role");

  if (userRole !== allowedRole) {
    const redirectTo = userRole === "doctor" ? "/doctor-dashboard" : "/";
    return <Navigate to={redirectTo} replace />;
  }

  return <Outlet />;
}