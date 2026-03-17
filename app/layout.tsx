import "./globals.css";
import { Cinzel, Inter } from "next/font/google";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-cinzel",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
});

export const metadata = {
  title: "Sélion — Studio Agent",
  description:
    "Agent intelligent Selen pour la gestion des prospects formation.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${cinzel.variable} ${inter.variable}`}>
      <body
        suppressHydrationWarning
        className="font-sans bg-[var(--bg-base)] text-[var(--text-primary)]"
      >
        {children}
      </body>
    </html>
  );
}
