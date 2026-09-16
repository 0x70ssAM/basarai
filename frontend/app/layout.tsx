import type { Metadata } from "next";
import localFont from "next/font/local";
import { Instrument_Serif, Hanken_Grotesk } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const sans = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Basar",
  description: "A brand studio for platform-ready images",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${geistMono.variable}`}
    >
      <body className="font-sans antialiased">
        {/*
          Explicit routing props, not env vars: without these, Clerk
          doesn't know this app has its own custom /login and /signup
          pages, and clerkMiddleware's auth.protect() falls back to
          redirecting unauthenticated requests to Clerk's own hosted
          Account Portal (https://<instance>.accounts.dev/sign-in)
          instead of our UI -- confirmed live on this deployment.
        */}
        <ClerkProvider
          signInUrl="/login"
          signUpUrl="/signup"
          signInFallbackRedirectUrl="/brands"
          signUpFallbackRedirectUrl="/brands"
        >
          {children}
          <Toaster />
        </ClerkProvider>
      </body>
    </html>
  );
}
