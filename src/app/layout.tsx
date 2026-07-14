import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Be_Vietnam_Pro, IBM_Plex_Mono } from "next/font/google";
import { cn } from "@/lib/utils";
import PwaUpdater from "@/components/PwaUpdater";

const sans = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-app-sans",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600"],
  variable: "--font-app-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PayLingo - Dịch song ngữ song song real-time",
  description: "Web app PWA dịch song ngữ song song real-time trực tiếp 2 chiều giữa người Việt và đối tác nước ngoài.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PayLingo",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f7f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1518" },
  ],
  width: "device-width",
  initialScale: 1,
};

const themeScript = `(()=>{try{const s=localStorage.getItem('theme');const t=s==='light'||s?.startsWith('light-')?'light':'dark';document.documentElement.dataset.theme=t;document.documentElement.classList.toggle('dark',t==='dark')}catch{}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      data-theme="dark"
      className={cn("h-full antialiased dark", "font-sans", sans.variable, mono.variable)}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full bg-background text-foreground font-sans">
        <PwaUpdater />
        {children}
      </body>
    </html>
  );
}
