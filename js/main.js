
/* Doves Dent Hail Repair — main.js */

// ── Sticky nav shadow ──
const nav = document.getElementById("navbar");
window.addEventListener("scroll", () => {
  nav.classList.toggle("scrolled", window.scrollY > 50);
});

// ── Hamburger ──
const hamburger = document.getElementById("hamburger");
const navLinks  = document.getElementById("navLinks");
if (hamburger) {
  hamburger.addEventListener("click", () => {
    hamburger.classList.toggle("open");
    navLinks.classList.toggle("open");
  });
  // close on link click
  navLinks.querySelectorAll("a").forEach(a => {
    a.addEventListener("click", () => {
      hamburger.classList.remove("open");
      navLinks.classList.remove("open");
    });
  });
}

// ── FAQ accordion ──
document.querySelectorAll(".faq-q").forEach(btn => {
  btn.addEventListener("click", () => {
    const item   = btn.parentElement;
    const isOpen = item.classList.contains("open");
    document.querySelectorAll(".faq-item").forEach(i => i.classList.remove("open"));
    if (!isOpen) item.classList.add("open");
  });
});

// ── Smooth scroll ──
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener("click", e => {
    const id = a.getAttribute("href").slice(1);
    const el = document.getElementById(id);
    if (el) {
      e.preventDefault();
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
});

// ── Mobile sticky bar ──
const bar = document.createElement("div");
bar.className = "mobile-bar";
bar.innerHTML = `
  <a href="tel:8064388209">&#128222; 806-438-8209</a>
  <a href="contact.html">&#128203; Book Inspection</a>
`;
document.body.appendChild(bar);

// ── Contact form feedback ──
const form = document.getElementById("contactForm");
if (form) {
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = form.querySelector(".btn-submit");
    if (!btn) return;

    const originalText = btn.textContent;
    btn.textContent = "Sending...";
    btn.disabled = true;

    try {
      const response = await fetch(form.action || "/api/contact", {
        method: "POST",
        body: new FormData(form)
      });

      if (!response.ok) {
        throw new Error("Request failed");
      }

      btn.textContent = "Request Sent! Aaron will call within 1 hour.";
      btn.style.background = "#15803d";
      btn.style.borderColor = "#15803d";
      form.reset();
    } catch (err) {
      btn.textContent = "Could not send. Please call 806-438-8209.";
      btn.style.background = "#b91c1c";
      btn.style.borderColor = "#b91c1c";
      btn.disabled = false;
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = "";
        btn.style.borderColor = "";
      }, 4500);
    }
  });
}

// ── Active nav link highlight ──
const currentPage = window.location.pathname.split("/").pop() || "index.html";
document.querySelectorAll(".nav-links a").forEach(a => {
  if (a.getAttribute("href") === currentPage) {
    a.style.color = "var(--gold)";
  }
});
