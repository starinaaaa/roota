import type { Metadata } from "next";
import { Jost, Unbounded } from "next/font/google";
import Header from "@/components/layout/Header";

const unbounded = Unbounded({
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500"],
  variable: "--font-display",
  display: "swap",
});
const jost = Jost({
  subsets: ["latin", "cyrillic"],
  variable: "--font-jost",
  display: "swap",
});
import Footer from "@/components/layout/Footer";
import CartDrawer from "@/components/cart/CartDrawer";
import FunnelTracker from "@/components/analytics/FunnelTracker";
import CookieBanner from "@/components/layout/CookieBanner";
import { CartUIProvider } from "@/contexts/CartUIContext";
import { getCart } from "@/lib/actions/cart";
import { getSiteContent } from "@/lib/site";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteContent();
  const share = site.shareImage || site.heroImage;
  return {
    metadataBase: new URL(
      process.env.NEXT_PUBLIC_SITE_URL || "https://roota.moscow",
    ),
    title: {
      default: "Студия авторской керамики",
      template: "%s | Студия авторской керамики",
    },
    description:
      "Авторская керамика ручной работы. Тарелки, стаканы, вазы и декор — каждое изделие создано с заботой о деталях.",
    openGraph: {
      type: "website",
      locale: "ru_RU",
      siteName: "Roota ceramics",
      images: [
        {
          url: share.startsWith("/site-media/")
            ? `${share}?format=jpeg`
            : share,
        },
      ],
    },
    icons: {
      icon: site.browserIcon
        ? {
            url: `${site.browserIcon}?format=png`,
            type: "image/png",
            sizes: "192x192",
          }
        : { url: "/brand/icon.svg", type: "image/svg+xml" },
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { items } = await getCart();
  const cartCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <html lang="ru" className={`${unbounded.variable} ${jost.variable}`}>
      <body className="bg-stone-50 text-stone-900 antialiased">
        <CartUIProvider initialItems={items}>
          <Header cartCount={cartCount} />
          <main>{children}</main>
          <Footer />
          <CartDrawer />
          <CookieBanner />
          <FunnelTracker />
        </CartUIProvider>
      </body>
    </html>
  );
}
