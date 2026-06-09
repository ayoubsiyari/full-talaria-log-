(function () {
  if (!("serviceWorker" in navigator)) return;
  var isEmbed = false;
  try {
    isEmbed = new URLSearchParams(window.location.search).get("multichart") === "1";
  } catch (_) {}
  if (isEmbed) return;

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("./sw.js").catch(function () {});
  });
})();

(function () {
  var STORAGE_KEY = "talaria_chart_pwa_install_dismissed";
  var deferredPrompt = null;
  var root = null;

  function isEmbed() {
    try {
      return new URLSearchParams(window.location.search).get("multichart") === "1";
    } catch (_) {
      return false;
    }
  }

  function isStandalone() {
    try {
      return (
        window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true
      );
    } catch (_) {
      return false;
    }
  }

  function dismissed() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch (_) {}
    hide();
  }

  function hide() {
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = null;
  }

  function render() {
    if (root || !deferredPrompt || isStandalone() || dismissed() || isEmbed()) return;

    root = document.createElement("div");
    root.id = "talaria-pwa-install";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Install Talaria");
    root.style.cssText =
      "position:fixed;right:16px;bottom:16px;z-index:99999;display:flex;align-items:center;gap:10px;" +
      "padding:12px 14px;border-radius:14px;border:1px solid rgba(255,255,255,0.14);" +
      "background:rgba(15,15,35,0.94);backdrop-filter:blur(12px);color:#fff;" +
      "font:600 13px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,0.45);";

    var text = document.createElement("span");
    text.textContent = "Install Talaria on your desktop";
    root.appendChild(text);

    var installBtn = document.createElement("button");
    installBtn.type = "button";
    installBtn.textContent = "Install";
    installBtn.style.cssText =
      "border:0;border-radius:999px;padding:8px 14px;background:#3b82f6;color:#fff;" +
      "font:inherit;cursor:pointer;";
    installBtn.addEventListener("click", function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(function () {
        deferredPrompt = null;
        dismiss();
      });
    });
    root.appendChild(installBtn);

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Dismiss");
    closeBtn.textContent = "×";
    closeBtn.style.cssText =
      "border:0;background:transparent;color:rgba(255,255,255,0.65);font:700 18px/1 sans-serif;cursor:pointer;padding:0 4px;";
    closeBtn.addEventListener("click", dismiss);
    root.appendChild(closeBtn);

    document.body.appendChild(root);
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    render();
  });

  window.addEventListener("appinstalled", function () {
    deferredPrompt = null;
    hide();
  });
})();
