import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, IBM_Plex_Serif } from "next/font/google";
import { SwRegister } from "@/components/sw-register";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

const plexSerif = IBM_Plex_Serif({
  subsets: ["latin", "latin-ext"],
  weight: ["500"],
  variable: "--font-logo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Zenuly",
  description: "Interní CRM pro callcentrum",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Zenuly",
  },
  icons: {
    apple: "/brand/icon/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#2449C9",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="cs" className={`${plexSans.variable} ${plexMono.variable} ${plexSerif.variable}`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className="bg-bg text-text font-sans antialiased">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
