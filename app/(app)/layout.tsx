import { Sidebar, TabBar } from "@/components/nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <main className="flex-1 p-6 pb-24 md:p-10">{children}</main>
      <TabBar />
    </div>
  );
}
