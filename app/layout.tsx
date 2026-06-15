import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";

export const metadata: Metadata = {
  title: "NGK AutoHub",
  description: "ERP operacional da NGK Store",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <Sidebar />

        <div className="ml-64 min-h-screen bg-slate-950">
          <Suspense fallback={null}>
            <Topbar />
          </Suspense>

          {children}
        </div>
      </body>
    </html>
  );
}