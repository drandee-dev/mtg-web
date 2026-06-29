const THEME_KEY = "mtgweb:theme";

export function getStoredTheme() {
  return localStorage.getItem(THEME_KEY) || "dark";
}

export function setStoredTheme(theme) {
  if (theme === "system") localStorage.removeItem(THEME_KEY);
  else localStorage.setItem(THEME_KEY, theme);
}

export function applyTheme(theme) {
  const el = document.documentElement;
  if (theme === "light" || theme === "dark") {
    el.dataset.theme = theme;
  } else {
    delete el.dataset.theme;
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const isDark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    meta.content = isDark ? "#0c0d11" : "#f4f4f7";
  }
}

export function initTheme() {
  applyTheme(getStoredTheme());
}
