document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => showTab(btn.dataset.tab));
});

function showTab(name) {
  document.querySelectorAll(".tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === name);
  });
  // Add active state to nav-links too
  document.querySelectorAll(".nav-link").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === name);
  });
  
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === name));
  
  if (name === "home" && window.Home) Home.render();
  if (name === "taste-lab" && window.TasteLab) TasteLab.render();
  if (name === "cellar" && window.Cellar) Cellar.load();
  if (name === "explore" && window.Explore) Explore.render();
  if (name === "lab-notes" && window.LabNotes) LabNotes.render();
  
  localStorage.setItem("lastTab", name);
  
  if (window.isMenuOpen) {
    window.toggleMenu();
  }
}

$("showTechDetails").addEventListener("change", (e) => {
  $("techDetails").classList.toggle("hidden", !e.target.checked);
  $("nav-lab-notes").style.display = e.target.checked ? "inline-block" : "none";
  if (e.target.checked && $("home").classList.contains("active") && window.Home) {
      Home.renderCharts();
  }
  localStorage.setItem("showTech", e.target.checked);
});

$("goTasteLab").addEventListener("click", () => showTab("taste-lab"));
$("btnCellarToLab").addEventListener("click", () => showTab("taste-lab"));

window.addEventListener("DOMContentLoaded", async () => {
  try {
    App.features = await api("/features");
    App.model = await api("/model");
    App.datasetSummary = await api("/dataset/summary");
    
    if (window.TasteLab) TasteLab.init();
    if (window.Explore) Explore.init();
    
    const showTech = localStorage.getItem("showTech") === "true";
    if (showTech) {
        $("showTechDetails").checked = true;
        $("showTechDetails").dispatchEvent(new Event("change"));
    }
    
    const lastTab = localStorage.getItem("lastTab") || "home";
    showTab(lastTab);
    
  } catch (e) {
    toast(e.message, true);
  }
});

// GSAP Fullscreen Menu Logic
const menuBtn = document.getElementById("menuToggleBtn");
const menuText = document.getElementById("menuToggleText");
const navWrap = document.querySelector(".nav-overlay-wrapper");
const overlay = document.getElementById("menuOverlay");
const menuContent = document.querySelector(".menu-content");
const bgPanels = document.querySelectorAll(".backdrop-layer");
const menuLinks = document.querySelectorAll(".nav-link");
const menuButtonTexts = document.querySelectorAll(".menu-button-text-p");
const menuButtonIcon = document.querySelector(".menu-button-icon");

window.isMenuOpen = false;

// Wait for GSAP to load
window.addEventListener("load", () => {
    if (typeof gsap === 'undefined') return;
    gsap.defaults({ ease: "power3.inOut", duration: 0.8 });

    window.toggleMenu = function() {
        window.isMenuOpen = !window.isMenuOpen;
        const tl = gsap.timeline();
        
        const layer1 = document.querySelector(".layer-1");
        const layer2 = document.querySelector(".layer-2");
        const layer3 = document.querySelector(".layer-3");
        const menuContentWrapper = document.querySelector(".menu-content-wrapper");
        
        if (window.isMenuOpen) {
            navWrap.style.display = "block";
            tl.set(navWrap, { display: "block" })
              .set(menuContent, { xPercent: 0 }, "<")
              .fromTo(menuButtonTexts, { yPercent: 0 }, { yPercent: -100, stagger: 0.2 }, "<")
              .fromTo(menuButtonIcon, { rotate: 0 }, { rotate: 315 }, "<")
              .to(menuBtn, { color: "#ffffff", duration: 0.4 }, "<")
              .fromTo(overlay, { autoAlpha: 0 }, { autoAlpha: 1 }, "<")
              
              // Layer 1 (White) - Fast
              .fromTo(layer1, { xPercent: 101 }, { xPercent: 0, duration: 0.5, ease: "power3.out" }, "<")
              // Layer 2 (Light Wine) - Slower
              .fromTo(layer2, { xPercent: 101 }, { xPercent: 0, duration: 0.65, ease: "power3.out" }, "<0.1")
              // Layer 3 (Dark Navbar) - Slowest
              .fromTo(layer3, { xPercent: 101 }, { xPercent: 0, duration: 0.8, ease: "power3.out" }, "<0.1")
              
              // Fade in and slide up links
              .fromTo(menuContentWrapper, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, "-=0.3")
              .fromTo(menuLinks, { yPercent: 140, rotate: 10 }, { yPercent: 0, rotate: 0, stagger: 0.05, duration: 0.6, ease: "power2.out" }, "-=0.4");
        } else {
            tl.to(menuContentWrapper, { autoAlpha: 0, duration: 0.2 })
              .to(layer3, { xPercent: 120, duration: 0.6, ease: "power3.in" }, "<")
              .to(layer2, { xPercent: 120, duration: 0.5, ease: "power3.in" }, "-=0.4")
              .to(layer1, { xPercent: 120, duration: 0.4, ease: "power3.in" }, "-=0.3")
              .to(menuButtonTexts, { yPercent: 0, duration: 0.4 }, "<")
              .to(menuButtonIcon, { rotate: 0, duration: 0.4 }, "<")
              .to(menuBtn, { color: "var(--wine-dark)", duration: 0.4 }, "<")
              .to(overlay, { autoAlpha: 0, duration: 0.4 }, "<")
              .set(navWrap, { display: "none" });
        }
    };

    if(menuBtn) menuBtn.addEventListener("click", window.toggleMenu);
    if(menuText) menuText.addEventListener("click", window.toggleMenu);
    if(overlay) overlay.addEventListener("click", () => { if(window.isMenuOpen) window.toggleMenu(); });

    // Hover effects on menu items
    document.querySelectorAll(".menu-list-item[data-shape]").forEach(item => {
        const shapeIndex = item.getAttribute("data-shape");
        const shape = document.querySelector(`.bg-shape-${shapeIndex}`);
        if (!shape) return;
        const shapeEls = shape.querySelectorAll(".shape-element");
        
        item.addEventListener("mouseenter", () => {
            document.querySelectorAll(".bg-shape").forEach(s => s.classList.remove("active"));
            shape.classList.add("active");
            gsap.fromTo(shapeEls, 
                { scale: 0.5, opacity: 0, rotation: -10 },
                { scale: 1, opacity: 1, rotation: 0, duration: 0.6, stagger: 0.08, ease: "back.out(1.7)", overwrite: "auto" }
            );
        });
        
        item.addEventListener("mouseleave", () => {
            gsap.to(shapeEls, {
                scale: 0.8, opacity: 0, duration: 0.3, ease: "power2.in",
                onComplete: () => shape.classList.remove("active"),
                overwrite: "auto"
            });
        });
    });
});

