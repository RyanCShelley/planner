import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Planner",
  description: "Goals into actions.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Planner", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0a0c0f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Applies the saved theme before paint so there is no flash.
const themeScript = `try{var t=localStorage.getItem("planner-theme");if(t==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
