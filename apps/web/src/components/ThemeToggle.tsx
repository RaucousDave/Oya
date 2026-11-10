import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      let saved: string | null = null;
      try { saved = localStorage.getItem("oya-theme"); } catch { /* Storage is optional. */ }
      setTheme(saved === "dark" || saved === "light" ? saved : media.matches ? "dark" : "light");
    };
    sync();
    media.addEventListener("change", sync);
    window.addEventListener("storage", sync);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#171614" : "#faf9f6");
  }, [theme]);

  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    try { localStorage.setItem("oya-theme", next); } catch { /* Still switch for this visit. */ }
    setTheme(next);
  };

  return <button className="theme-toggle" type="button" onClick={toggle}
    aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
    title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {theme === "light" ? <path d="M20.8 13a9 9 0 0 1-9.8-9.8A9 9 0 1 0 20.8 13Z" /> : <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>}
    </svg>
  </button>;
}
