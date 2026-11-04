// Theme bootstrap. Kept as a separate file so it runs under CSP script-src 'self'.
(function () {
  try {
    var savedTheme = localStorage.getItem("personakiln-theme");
    if (savedTheme === "light") document.documentElement.classList.remove("dark");
    else document.documentElement.classList.add("dark");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", savedTheme === "light" ? "#f7f4ee" : "#191816");
  } catch {
    document.documentElement.classList.add("dark");
  }
})();
