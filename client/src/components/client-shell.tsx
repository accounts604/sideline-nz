"use client";

import { useState, useEffect } from "react";
import { SplashLoader } from "./splash-loader";

export function ClientShell({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    // If session storage check happens instantly in SplashLoader, 
    // we might need to coordinate this state better, but for now:
    const hasSeenSplash = sessionStorage.getItem("hasSeenSplash");
    if (hasSeenSplash) {
        setIsLoading(false);
        setShowContent(true);
    }
  }, []);

  const handleSplashComplete = () => {
    setIsLoading(false);
    setTimeout(() => setShowContent(true), 100); // Slight delay to ensure DOM is ready
  };

  return (
    <>
      {isLoading && <SplashLoader onComplete={handleSplashComplete} />}
      
      <div 
        className={`transition-opacity duration-700 ease-in ${
          showContent ? "opacity-100" : "opacity-0"
        }`}
      >
        {children}
      </div>
    </>
  );
}
