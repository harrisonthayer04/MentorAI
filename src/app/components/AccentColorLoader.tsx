"use client";

import { useEffect } from "react";

export default function AccentColorLoader() {
  useEffect(() => {
    try {
      const savedColor = localStorage.getItem("accent_color");
      if (savedColor && /^#[0-9A-Fa-f]{6}$/i.test(savedColor)) {
        document.documentElement.style.setProperty("--color-brand", savedColor);
        document.documentElement.style.setProperty("--color-ring", savedColor);
      }
    } catch {
      // ignore localStorage errors
    }
  }, []);

  return null;
}
