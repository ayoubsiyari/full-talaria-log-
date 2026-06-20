"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { DM_Sans, Signika } from "next/font/google";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-404-dm",
});

const signika = Signika({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-404-signika",
});

const containerVariants = {
  hidden: {
    opacity: 0,
    y: 30,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.7,
      ease: [0.43, 0.13, 0.23, 0.96],
      delayChildren: 0.1,
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: {
    opacity: 0,
    y: 20,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.43, 0.13, 0.23, 0.96],
    },
  },
};

const numberVariants = {
  hidden: (direction: number) => ({
    opacity: 0,
    x: direction * 40,
    y: 15,
    rotate: direction * 5,
  }),
  visible: {
    opacity: 0.7,
    x: 0,
    y: 0,
    rotate: 0,
    transition: {
      duration: 0.8,
      ease: [0.43, 0.13, 0.23, 0.96],
    },
  },
};

const ghostVariants = {
  hidden: {
    scale: 0.8,
    opacity: 0,
    y: 15,
    rotate: -5,
  },
  visible: {
    scale: 1,
    opacity: 1,
    y: 0,
    rotate: 0,
    transition: {
      duration: 0.6,
      ease: [0.43, 0.13, 0.23, 0.96],
    },
  },
  hover: {
    scale: 1.08,
    y: -10,
    rotate: [0, -5, 5, -5, 0],
    transition: {
      duration: 0.8,
      ease: "easeInOut",
      rotate: {
        duration: 2,
        ease: "linear",
        repeat: Infinity,
        repeatType: "reverse",
      },
    },
  },
  floating: {
    y: [-5, 5],
    transition: {
      y: {
        duration: 2,
        ease: "easeInOut",
        repeat: Infinity,
        repeatType: "reverse",
      },
    },
  },
};

export type GhostErrorVariant = "404" | "403";

const ERROR_COPY: Record<
  GhostErrorVariant,
  { left: string; right: string; title: string; message: string; wikiHref: string; wikiLabel: string }
> = {
  "404": {
    left: "4",
    right: "4",
    title: "Boo! Page missing!",
    message: "This page must be a ghost — it's not here.",
    wikiHref: "https://en.wikipedia.org/wiki/HTTP_404",
    wikiLabel: "What does 404 mean?",
  },
  "403": {
    left: "4",
    right: "3",
    title: "Boo! Access denied!",
    message: "You don't have permission to open this page.",
    wikiHref: "https://en.wikipedia.org/wiki/HTTP_403",
    wikiLabel: "What does 403 mean?",
  },
};

export function GhostErrorPage({ variant = "404" }: { variant?: GhostErrorVariant }) {
  const copy = ERROR_COPY[variant];
  return (
    <div
      dir="ltr"
      className={`${dmSans.variable} ${signika.variable} min-h-screen flex flex-col items-center justify-center bg-background px-4`}
    >
      <AnimatePresence mode="wait">
        <motion.div
          className="text-center max-w-lg"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
        >
          <div className="flex items-center justify-center gap-4 md:gap-6 mb-8 md:mb-12">
            <motion.span
              className={`${signika.className} text-[80px] md:text-[120px] font-bold text-foreground/80 select-none`}
              variants={numberVariants}
              custom={-1}
            >
              {copy.left}
            </motion.span>
          </div>

          <motion.h1
            className={`${dmSans.className} text-3xl md:text-5xl font-bold text-foreground mb-4 md:mb-6 select-none`}
            variants={itemVariants}
          >
            {copy.title}
          </motion.h1>

          <motion.p
            className={`${dmSans.className} text-lg md:text-xl text-muted-foreground mb-8 md:mb-12 select-none`}
            variants={itemVariants}
          >
            {copy.message}
          </motion.p>

          <motion.div
            variants={itemVariants}
            whileHover={{
              scale: 1.05,
              transition: {
                duration: 0.3,
                ease: [0.43, 0.13, 0.23, 0.96],
              },
            }}
          >
            <Link
              href="/"
              className={`${dmSans.className} inline-block rounded-full bg-primary px-8 py-3 text-lg font-medium text-primary-foreground transition-colors hover:bg-primary/90 select-none`}
            >
              Back home
            </Link>
          </motion.div>

          <motion.div className="mt-12" variants={itemVariants}>
            <a
              href={copy.wikiHref}
              target="_blank"
              rel="noopener noreferrer"
              className={`${dmSans.className} text-muted-foreground underline transition-opacity hover:opacity-80 select-none`}
            >
              {copy.wikiLabel}
            </a>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export function GhostNotFound() {
  return <GhostErrorPage variant="404" />;
}
