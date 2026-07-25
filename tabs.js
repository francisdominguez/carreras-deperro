// ============ CONTROL DE PESTAÑAS (pantalla única) ============
document.addEventListener("DOMContentLoaded", () => {
  const buttons = document.querySelectorAll(".tab-btn");
  const panels = document.querySelectorAll(".tab-panel");
  const panelsWrap = document.querySelector(".tab-panels");
  const DEFAULT_TAB = "analisis";
  const STORAGE_KEY = "carreras_active_tab";

  function activate(tab) {
    let matched = false;
    panels.forEach(p => {
      const isMatch = p.dataset.tab === tab;
      p.classList.toggle("active", isMatch);
      if (isMatch) matched = true;
    });
    if (!matched) return activate(DEFAULT_TAB);

    buttons.forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    if (panelsWrap) panelsWrap.scrollTop = 0;
    try { sessionStorage.setItem(STORAGE_KEY, tab); } catch (e) {}
  }

  buttons.forEach(btn => {
    btn.addEventListener("click", () => activate(btn.dataset.tab));
  });

  let initial = DEFAULT_TAB;
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) initial = saved;
  } catch (e) {}

  activate(initial);
});
