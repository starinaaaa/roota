import type { Metadata, Viewport } from "next";
import WheelApp from "@/components/wheel/WheelApp";
import "./wheel.css";

export const metadata: Metadata = {
  title: { absolute: "Рулетка дел" },
  robots: { index: false, follow: false, noarchive: true },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f5f2ea",
  viewportFit: "cover",
};
export default function WheelPage() {
  return <WheelApp />;
}
