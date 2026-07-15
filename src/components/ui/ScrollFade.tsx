"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

interface ScrollFadeProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

export default function ScrollFade({ children, delay = 0, className }: ScrollFadeProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, delay: delay / 1000 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
