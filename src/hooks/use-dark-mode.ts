import { useEffect, useState } from "react";

export function useDarkMode() {
  const [isDark, setIsDark] = useState(
    () => localStorage.getItem("string:darkMode") === "true",
  );

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("string:darkMode", String(isDark));
  }, [isDark]);

  return { isDark, toggleDark: () => setIsDark((prev) => !prev) };
}
