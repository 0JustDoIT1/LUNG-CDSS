import { Outlet } from "react-router-dom";
import { ClipboardList, Upload } from "lucide-react";
import Header from "../components/shared/Header";
import Sidebar from "../components/shared/Sidebar";

const NAV_ITEMS = [
  { to: "/", label: "케이스 리스트", icon: ClipboardList, end: true },
  { to: "/upload", label: "업로드", icon: Upload },
];

export default function PathologistLayout() {
  return (
    <div className="flex flex-col min-h-screen bg-[#f7f8fa]">
      <Header />
      <div className="flex flex-1 min-h-0">
        <Sidebar items={NAV_ITEMS} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] p-4 lg:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}