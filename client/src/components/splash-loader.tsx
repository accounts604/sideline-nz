"use client";

import { useEffect, useState } from "react";
import logo from "@assets/Sideline_Logo_1765694323892.png";

export function SplashLoader({ onComplete }: { onComplete: () => void }) {
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    // Check session storage to see if we've already shown the splash
    const hasSeenSplash = sessionStorage.getItem("hasSeenSplash");

    if (hasSeenSplash) {
      onComplete();
      return;
    }

    // Lock scroll
    document.body.style.overflow = "hidden";

    // Animation sequence
    const timer1 = setTimeout(() => {
      setIsFading(true);
    }, 1200); // Wait 1.2s before starting fade

    const timer2 = setTimeout(() => {
      sessionStorage.setItem("hasSeenSplash", "true");
      document.body.style.overflow = "unset";
      onComplete();
    }, 1900); // 1.2s + 0.7s fade duration

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      document.body.style.overflow = "unset";
    };
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black transition-opacity duration-700 ease-out ${
        isFading ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      <div className="animate-in zoom-in-95 duration-1000 fade-in">
        {/* Logo Placeholder - Swap with real SVG later */}
        <div className="flex flex-col items-center">
             <img src={logo} alt="Sideline NZ" className="h-16 w-auto object-contain brightness-0 invert mb-4" />
        </div>
      </div>
      
      {/* Optional "Built by" pill */}
      <div className="absolute bottom-8 left-8 bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] text-white/50 uppercase tracking-widest border border-white/5">
        Sideline NZ
      </div>
    </div>
  );
}
