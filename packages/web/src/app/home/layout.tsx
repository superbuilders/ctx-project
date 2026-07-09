import { Sidebar } from "@/components/Sidebar";

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 ml-56">{children}</main>
    </div>
  );
}
