import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { firebaseConfig, isConfigured } from "./firebase-config.js";

function setText(selector, value) {
  if (!value) return;
  document.querySelectorAll(selector).forEach((el) => {
    el.textContent = value;
  });
}

function setHtml(selector, value) {
  if (!value) return;
  document.querySelectorAll(selector).forEach((el) => {
    el.innerHTML = value;
  });
}

function setPhone(value) {
  if (!value) return;
  const raw = value.replace(/[^\d+]/g, "");
  document.querySelectorAll("a[href^='tel:']").forEach((a) => {
    a.setAttribute("href", `tel:${raw}`);
    a.innerHTML = a.innerHTML.replace(/\d[\d\-\s()]+/g, value);
  });
}

function setEmail(value) {
  if (!value) return;
  document.querySelectorAll("a[href^='mailto:']").forEach((a) => {
    a.setAttribute("href", `mailto:${value}`);
    a.innerHTML = a.innerHTML.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, value);
  });
}

function getPageId() {
  return document.body.dataset.page || "";
}

function applyCommon(common = {}) {
  if (common.businessName) {
    const split = common.businessName.replace(" Hail Repair", "");
    setHtml(".footer-biz-name", `${split} <span>Hail Repair</span>`);
  }
  setText(".footer-tagline", common.footerTagline);

  const ownerMeta = document.querySelector(".footer-contact-list .meta");
  if (ownerMeta && common.ownerLabel) {
    ownerMeta.textContent = common.ownerLabel;
  }

  setEmail(common.email);
  setPhone(common.phoneDisplay);

  if (common.navBookLabel) {
    setText(".nav-ctas .btn-gold", common.navBookLabel);
  }
}

function applyHome(home = {}) {
  setText(".hero-badge", home.heroBadge);

  if (home.heroTitleTop || home.heroTitleAccent) {
    const top = home.heroTitleTop || "Expert Hail Damage Repair";
    const accent = home.heroTitleAccent || "Without Repainting";
    setHtml(".hero h1", `${top}<br><span class=\"text-gold\">${accent}</span>`);
  }

  setText(".hero-content > p", home.heroSubtitle);
  setText(".hero-actions .btn-gold", home.heroPrimaryCta);
  setText(".hero-actions .btn-outline-white", home.heroSecondaryCta);

  setText(".services-grid .service-card:nth-child(1) h3", home.service1Title);
  setText(".services-grid .service-card:nth-child(1) p", home.service1Body);
  setText(".services-grid .service-card:nth-child(2) h3", home.service2Title);
  setText(".services-grid .service-card:nth-child(2) p", home.service2Body);
  setText(".services-grid .service-card:nth-child(3) h3", home.service3Title);
  setText(".services-grid .service-card:nth-child(3) p", home.service3Body);

  setText(".cta-banner h2", home.ctaTitle);
  setText(".cta-banner .container > p", home.ctaBody);
  setText(".cta-actions .btn-gold", home.ctaPrimary);
  setText(".cta-actions .btn-outline-white", home.ctaSecondary);
}

function applyServices(services = {}) {
  setText(".page-hero .sub", services.heroSubtitle);
  setText("#hail .sd-text p:nth-of-type(1)", services.hailBody1);
  setText("#pdr .sd-text p:nth-of-type(1)", services.pdrBody1);
  setText("#insurance .sd-text p:nth-of-type(1)", services.insuranceBody1);
}

function applyFaq(faq = {}) {
  setText(".page-hero .sub", faq.heroSubtitle);
}

function applyContact(contact = {}) {
  setText(".page-hero .sub", contact.heroSubtitle);
  setText(".contact-info > p", contact.introBody);

  const details = document.querySelectorAll(".contact-detail");
  details.forEach((item) => {
    const strong = item.querySelector("strong");
    const span = item.querySelector("span");
    if (strong && span && strong.textContent.trim() === "Response Time" && contact.responseTime) {
      span.textContent = contact.responseTime;
    }
  });
}

async function loadAndApply() {
  if (!isConfigured()) return;

  try {
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const snap = await getDoc(doc(db, "site", "content"));
    if (!snap.exists()) return;

    const data = snap.data();
    applyCommon(data.common || {});

    const page = getPageId();
    if (page === "home") applyHome(data.home || {});
    if (page === "services") applyServices(data.services || {});
    if (page === "faq") applyFaq(data.faq || {});
    if (page === "contact") applyContact(data.contact || {});
  } catch (err) {
    console.error("Could not load site content", err);
  }
}

loadAndApply();
