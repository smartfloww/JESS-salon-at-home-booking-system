import type { Metadata } from "next";
import "./globals.css";
import "./jess.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "JESS Salon at Home — Your Hair. Your Home. Your Style.",
  description:
    "Salon-quality hair services, brought to your doorstep. Book JESS Salon at Home across Metro Manila, Cavite, Laguna and Batangas.",
  icons: {
    icon: "/imgs/logo.jpeg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
