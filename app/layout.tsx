import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { Suspense } from "react";
import "./globals.css";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import { COOKIE_TEMA, temaDoCookie } from "@/lib/tema";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "NGK AutoHub",
  description: "ERP operacional da NGK Store",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Tema vem do cookie já no servidor: a classe `dark` entra no primeiro HTML,
  // sem piscar entre claro e escuro.
  const tema = temaDoCookie((await cookies()).get(COOKIE_TEMA)?.value);

  return (
    <html lang="pt-BR" className={`${inter.variable}${tema === "escuro" ? " dark" : ""}`} suppressHydrationWarning>
      <body className="bg-fundo text-texto">
        <Sidebar />

        <div className="ml-64 min-h-screen bg-fundo">
          <Suspense fallback={null}>
            <Topbar tema={tema} />
          </Suspense>

          {children}
        </div>
      </body>
    </html>
  );
}
