import { Sidebar, TabBar } from "@/components/nav";
import { Toast } from "@/components/toast";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <main className="min-w-0 flex-1 p-6 pb-24 md:p-10">{children}</main>
      <TabBar />
      <Toast />
    </div>
  );
}
