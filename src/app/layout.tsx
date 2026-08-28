import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { PwaRegistration } from "@/components/pwa-registration";

export const metadata: Metadata = {
  title: { default: "Prodexy Labs", template: "%s · Prodexy Labs" },
  description: "Sistema central de gestão da Prodexy Labs",
  applicationName: "Prodexy Labs",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Prodexy Labs",
  },
  icons: {
    apple: [{ url: "/pwa/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><AppShell>{children}</AppShell><PwaRegistration /></body></html>;
}
