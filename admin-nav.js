/* =========================================================
   admin-nav.js — shared behaviour for every admin view
   · Logout (clears the session and returns to the login page)
   · Refresh buttons (they live in the page toolbar, not the nav)
   · Highlights the current page in the nav
   ========================================================= */
(function () {
  "use strict";

  /* ---------- Logout ---------- */
  document.querySelectorAll(".logout-btn, #logoutBtn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      localStorage.removeItem("loggedInUser");
      sessionStorage.clear();
      window.location.href = "index.html";
    });
  });

  /* ---------- Refresh buttons ---------- */
  document.querySelectorAll("[data-refresh]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.refresh;
      const reload =
        name && typeof window[name] === "function"
          ? window[name]
          : () => window.location.reload();

      const original = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = "Refreshing…";

      try {
        reload();
      } finally {
        setTimeout(() => {
          btn.innerHTML = original;
          btn.disabled = false;
        }, 700);
      }
    });
  });

  /* ---------- Highlight the current page ---------- */
  const current = (
    window.location.pathname.split("/").pop() || "admin.html"
  ).toLowerCase();

  document.querySelectorAll(".admin-nav a").forEach((link) => {
    const href = (link.getAttribute("href") || "").toLowerCase();
    link.classList.toggle("active", href === current);
  });
})();
