import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meeting English Coach",
  description:
    "Personal English coach for workplace meetings - role-play practice with specific, persistent feedback.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Coach",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#f9f9f7",
  // viewport-fit=cover lets the UI run under the notch and home indicator.
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  // Allow pinch-zoom: blocking it is an accessibility failure, and nothing here
  // depends on a fixed scale.
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      {/*
        suppressHydrationWarning is here for browser extensions, not for our own code.
        Grammarly and friends inject attributes (data-gr-ext-installed,
        data-new-gr-c-s-check-loaded) onto <body> before React hydrates, so the server
        HTML and the live DOM differ and React reports a mismatch we did not cause.

        It only covers THIS element's own attributes — one level deep, not the tree — so
        a real hydration bug inside the app still gets reported.
      */}
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
