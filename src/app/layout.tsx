import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "JESS Salon at Home — Your Hair. Your Home. Your Style.",
  description:
    "Salon-quality hair services, brought to your doorstep across Metro Manila, Cavite, Laguna and Batangas. Book JESS Salon at Home online.",
  keywords: [
    "JESS Salon at Home",
    "home salon",
    "haircut at home",
    "Metro Manila salon",
    "Quezon City salon",
    "hair color Philippines",
  ],
  authors: [{ name: "JESS Salon at Home" }],
  icons: {
    icon: "/logo.jpeg",
  },
  openGraph: {
    title: "JESS Salon at Home",
    description: "Your Hair. Your Home. Your Style.",
    siteName: "JESS Salon at Home",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        {children}
        <Toaster />
        <SonnerToaster position="top-center" richColors />
      </body>
    </html>
  );
}
