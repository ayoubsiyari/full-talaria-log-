import { Exo_2 } from "next/font/google";

/** Dashboard + pricing UI — preloaded only on routes that import this module. */
export const exo2 = Exo_2({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-exo-2",
  display: "swap",
});
