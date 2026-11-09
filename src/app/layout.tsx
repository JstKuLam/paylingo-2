import type { Metadata, Viewport } from "next";
import "./fonts.css";
import "./globals.css";
import { cn } from "@/lib/utils";
import PwaUpdater from "@/components/PwaUpdater";

export const metadata: Metadata = {
  title: "PayLingo - Dịch song ngữ song song real-time",
  description: "Web app PWA dịch song ngữ song song real-time trực tiếp 2 chiều giữa người Việt và đối tác nước ngoài.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PayLingo",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f9fc" },
    { media: "(prefers-color-scheme: dark)", color: "#151824" },
  ],
  width: "device-width",
  initialScale: 1,
};

const themeScript = `(()=>{try{const m=window.innerWidth<=760;if(m&&!localStorage.getItem('paylingo_mobile_dark_v1')){localStorage.setItem('theme','dark');localStorage.setItem('paylingo_mobile_dark_v1','1');localStorage.setItem('paylingo_cobalt_v1','1')}else if(!m&&!localStorage.getItem('paylingo_cobalt_v1')){localStorage.setItem('theme','light');localStorage.setItem('paylingo_cobalt_v1','1')}const s=localStorage.getItem('theme');const t=s==='dark'?'dark':s==='light'?'light':(m?'dark':'light');document.documentElement.dataset.theme=t;document.documentElement.classList.toggle('dark',t==='dark')}catch{}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      data-theme="light"
      className={cn("h-full antialiased", "font-sans")}
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
