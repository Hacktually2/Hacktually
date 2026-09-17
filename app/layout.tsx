import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "DemandX",
    template: "%s · DemandX",
  },
  description:
    "Demand forecasting and inventory decision support for Indonesian manufacturers and distributors.",
};

/**
 * Runs before the first paint, so the page is never painted with the wrong
 * theme or density and then corrected. A stored choice wins; otherwise the OS
 * setting decides.
 *
 * Kept as a raw string rather than imported, because anything bundled would run
 * after paint and reintroduce the flash. The storage keys match PREF_KEYS in
 * lib/preferences.ts.
 *
 * It also subscribes to the OS colour-scheme, but only while no explicit choice
 * is stored, so "System" keeps tracking the device without a React listener.
 */
const PREFS_SCRIPT = `(function(){
var d=document.documentElement;
function pref(k){try{return localStorage.getItem(k)}catch(e){return null}}
try{
  var mq=window.matchMedia("(prefers-color-scheme: dark)");
  var stored=pref("demandx-theme");
  d.setAttribute("data-theme", stored==="light"||stored==="dark" ? stored : (mq.matches?"dark":"light"));
  mq.addEventListener("change",function(e){
    if(!pref("demandx-theme")) d.setAttribute("data-theme", e.matches?"dark":"light");
  });
  if(pref("demandx-density")==="compact") d.setAttribute("data-density","compact");
  if(pref("demandx-motion")==="reduce") d.setAttribute("data-motion","reduce");
}catch(e){ d.setAttribute("data-theme","light") }
})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${plusJakartaSans.variable} h-full antialiased`}
      // The script sets data-theme and friends before React hydrates, which React would
      // otherwise report as a mismatch against its own server-rendered markup.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
