import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { firebaseConfig, ADMIN_EMAILS, isConfigured } from "./firebase-config.js";

const authCard = document.getElementById("authCard");
const adminPanel = document.getElementById("adminPanel");
const signInBtn = document.getElementById("signInBtn");
const signOutBtn = document.getElementById("signOutBtn");
const signedInAs = document.getElementById("signedInAs");
const saveBtn = document.getElementById("saveBtn");
const saveStatus = document.getElementById("saveStatus");
const form = document.getElementById("contentForm");
const submissionList = document.getElementById("submissionList");
const submissionStatus = document.getElementById("submissionStatus");
const refreshSubmissionsBtn = document.getElementById("refreshSubmissionsBtn");
const cleanupPhotosBtn = document.getElementById("cleanupPhotosBtn");

const requestCount = document.getElementById("requestCount");

// Show one panel of a tab group at a time (main sections and content pages).
function setupTabs(group) {
  const tabs = [...document.querySelectorAll(`[data-tab-group="${group}"] [role="tab"]`)];
  const select = (selected) => {
    tabs.forEach((tab) => {
      const on = tab === selected;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      document.getElementById(tab.getAttribute("aria-controls")).hidden = !on;
    });
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (event) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!step) return;
      const next = tabs[(i + step + tabs.length) % tabs.length];
      select(next);
      next.focus();
    });
  });
  select(tabs[0]);
}
setupTabs("main");
setupTabs("content");

const defaults = {
  common: {
    businessName: "Doves Dent Hail Repair",
    ownerLabel: "Aaron Dove - Owner / Estimator",
    phoneDisplay: "806-438-8209",
    email: "dovehailrepair@gmail.com",
    navBookLabel: "Book Free Inspection",
    footerTagline: "Precision paintless dent repair and hail damage restoration. We restore your vehicle to factory condition without repainting. Every repair backed by a lifetime warranty."
  },
  home: {
    heroBadge: "Free Inspections - Lifetime Warranty - Insurance Approved",
    heroTitleTop: "Expert Hail Damage Repair",
    heroTitleAccent: "Without Repainting",
    heroSubtitle: "Doves Dent Hail Repair restores your vehicle to factory condition using precision Paintless Dent Repair.",
    heroPrimaryCta: "Schedule Free Inspection",
    heroSecondaryCta: "Call 806-438-8209",
    service1Title: "Hail Damage Repair",
    service1Body: "Storm leave your vehicle covered in dents? We restore every panel to factory condition with precision PDR.",
    service2Title: "Paintless Dent Repair",
    service2Body: "Door dings and minor creases removed without touching factory paint.",
    service3Title: "Insurance Claim Help",
    service3Body: "We guide you through the claim process and coordinate with your insurance carrier.",
    ctaTitle: "Did Hail Hit Your Vehicle?",
    ctaBody: "Schedule a free inspection today and get a written estimate quickly.",
    ctaPrimary: "Schedule Free Inspection",
    ctaSecondary: "Call 806-438-8209"
  },
  services: {
    heroSubtitle: "Expert paintless dent repair and hail damage restoration with no paint and no fillers.",
    hailBody1: "When a storm leaves your vehicle covered in dents, Doves Dent is who you call.",
    pdrBody1: "Door dings and minor creases are exactly what PDR was designed to fix.",
    insuranceBody1: "Navigating an insurance claim can feel overwhelming. We walk you through every step."
  },
  faq: {
    heroSubtitle: "Straight answers about PDR, hail damage, insurance, and what to expect when you work with us."
  },
  contact: {
    heroSubtitle: "Call or text Aaron directly, or fill out the form below.",
    introBody: "The fastest way to get started is to call or text Aaron directly.",
    responseTime: "We reply within 1 hour during business hours"
  },
  reviews: [
    {
      text: "Aaron came out the same day and had my truck looking brand new. The hail damage was everywhere and now you cannot tell it ever happened. Incredible work at a fair price.",
      name: "Mike T.",
      location: "Local Customer",
      stars: 5
    },
    {
      text: "I had no idea how to file a hail claim and Aaron walked me through the whole process. He dealt with my insurance company directly. I only paid my deductible. Highly recommend!",
      name: "Sandra R.",
      location: "Local Customer",
      stars: 5
    },
    {
      text: "Professional, fast, and honest. Got a free inspection the next morning and my car was fixed that afternoon. The repair is perfect — no paint, no filler, just like factory.",
      name: "James K.",
      location: "Local Customer",
      stars: 5
    }
  ]
};

// ── Customer reviews editor ──
const reviewList = document.getElementById("reviewList");
const addReviewBtn = document.getElementById("addReviewBtn");
let reviews = [];

function renderReviews() {
  if (!reviewList) return;
  if (reviews.length === 0) {
    reviewList.innerHTML = '<p class="submission-empty">No reviews. The reviews section is hidden on the home page.</p>';
    return;
  }

  reviewList.innerHTML = reviews
    .map(
      (review, i) => `<div class="review-editor" data-index="${i}">
        <div class="review-editor-head">
          <strong>Review ${i + 1}</strong>
          <span class="review-editor-actions">
            <button type="button" data-action="up" ${i === 0 ? "disabled" : ""} aria-label="Move up">&uarr;</button>
            <button type="button" data-action="down" ${i === reviews.length - 1 ? "disabled" : ""} aria-label="Move down">&darr;</button>
            <button type="button" data-action="remove" class="danger">Remove</button>
          </span>
        </div>
        <label>Customer Name<input data-field="name" type="text" value="${escapeHtml(review.name)}"></label>
        <label>Label (e.g. Local Customer)<input data-field="location" type="text" value="${escapeHtml(review.location)}"></label>
        <label>Stars
          <select data-field="stars">
            ${[5, 4, 3, 2, 1].map((n) => `<option value="${n}"${Number(review.stars) === n ? " selected" : ""}>${n}</option>`).join("")}
          </select>
        </label>
        <label>Review<textarea data-field="text" rows="4">${escapeHtml(review.text)}</textarea></label>
      </div>`
    )
    .join("");
}

if (reviewList) {
  reviewList.addEventListener("input", (event) => {
    const field = event.target.dataset.field;
    const row = event.target.closest(".review-editor");
    if (!field || !row) return;
    reviews[Number(row.dataset.index)][field] = event.target.value;
  });

  reviewList.addEventListener("click", (event) => {
    const action = event.target.dataset.action;
    const row = event.target.closest(".review-editor");
    if (!action || !row) return;
    const i = Number(row.dataset.index);
    if (action === "remove") reviews.splice(i, 1);
    if (action === "up" && i > 0) [reviews[i - 1], reviews[i]] = [reviews[i], reviews[i - 1]];
    if (action === "down" && i < reviews.length - 1) [reviews[i + 1], reviews[i]] = [reviews[i], reviews[i + 1]];
    renderReviews();
  });
}

if (addReviewBtn) {
  addReviewBtn.addEventListener("click", () => {
    reviews.push({ text: "", name: "", location: "Local Customer", stars: 5 });
    renderReviews();
    const last = reviewList.querySelector(".review-editor:last-child textarea");
    if (last) last.focus();
  });
}

function collectReviews() {
  return reviews
    .map((r) => ({
      text: String(r.text || "").trim(),
      name: String(r.name || "").trim(),
      location: String(r.location || "").trim(),
      stars: Math.min(5, Math.max(1, Number(r.stars) || 5))
    }))
    .filter((r) => r.text);
}

function deepMerge(base, incoming) {
  const out = { ...base };
  Object.keys(incoming || {}).forEach((key) => {
    const baseVal = base[key];
    const nextVal = incoming[key];
    if (baseVal && typeof baseVal === "object" && !Array.isArray(baseVal) && nextVal && typeof nextVal === "object") {
      out[key] = deepMerge(baseVal, nextVal);
    } else {
      out[key] = nextVal;
    }
  });
  return out;
}

function setDeep(obj, path, value) {
  const keys = path.split(".");
  let ptr = obj;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const k = keys[i];
    if (!ptr[k] || typeof ptr[k] !== "object") ptr[k] = {};
    ptr = ptr[k];
  }
  ptr[keys[keys.length - 1]] = value;
}

function getDeep(obj, path) {
  return path.split(".").reduce((acc, key) => (acc ? acc[key] : undefined), obj);
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function renderSubmissions(submissions) {
  if (!submissionList) return;

  const total = Array.isArray(submissions) ? submissions.length : 0;
  if (requestCount) {
    requestCount.textContent = String(total);
    requestCount.hidden = total === 0;
  }

  if (total === 0) {
    submissionList.innerHTML = '<p class="submission-empty">No inspection requests yet.</p>';
    return;
  }

  submissionList.innerHTML = submissions
    .map((item, index) => {
      const photos = (item.images || [])
        .map(
          (image) =>
            `<a href="${escapeHtml(image.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(image.url)}" alt="Damage photo" loading="lazy"></a>`
        )
        .join("");

      const phoneDigits = String(item.phone || "").replace(/[^\d+]/g, "");

      const photoCount = (item.images || []).length;
      const photoBadge = photoCount
        ? `<span class="submission-badge">${photoCount} photo${photoCount === 1 ? "" : "s"}</span>`
        : "";

      return `<details class="submission-card"${index === 0 ? " open" : ""}>
        <summary class="submission-header">
          <strong>${escapeHtml(item.name || "Unknown")}</strong>
          <span class="submission-summary">${escapeHtml(item.damage || "")}</span>
          ${photoBadge}
          <span class="submission-date">${escapeHtml(formatDate(item.createdAt))}</span>
        </summary>
        <dl class="submission-meta">
          <div><strong>Phone:</strong> ${item.phone ? `<a href="tel:${escapeHtml(phoneDigits)}">${escapeHtml(item.phone)}</a>` : "&mdash;"}</div>
          <div><strong>Email:</strong> ${item.email ? `<a href="mailto:${escapeHtml(item.email)}">${escapeHtml(item.email)}</a>` : "&mdash;"}</div>
          <div><strong>Vehicle:</strong> ${escapeHtml(item.vehicle || "&mdash;")}</div>
          <div><strong>Damage:</strong> ${escapeHtml(item.damage || "&mdash;")}</div>
          <div><strong>Insurance:</strong> ${escapeHtml(item.insured || "&mdash;")}</div>
          <div><strong>Preferred:</strong> ${escapeHtml(item.preferred || "&mdash;")}</div>
        </dl>
        ${item.notes ? `<p class="submission-notes">${escapeHtml(item.notes)}</p>` : ""}
        ${photos ? `<div class="submission-photos">${photos}</div>` : ""}
        <div class="submission-actions">
          <button type="button" class="btn-delete" data-delete-id="${escapeHtml(item.id)}" data-delete-name="${escapeHtml(item.name || "this request")}">Delete request${photoCount ? " &amp; photos" : ""}</button>
        </div>
      </details>`;
    })
    .join("");
}

async function loadSubmissions() {
  const user = auth.currentUser;
  if (!user) return;

  if (submissionStatus) {
    submissionStatus.style.color = "";
    submissionStatus.textContent = "Loading requests...";
  }

  try {
    const token = await user.getIdToken();
    const response = await fetch("/api/submissions", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Could not load requests.");
    }

    renderSubmissions(data.submissions);
    if (submissionStatus) submissionStatus.textContent = "";
  } catch (err) {
    if (submissionStatus) {
      submissionStatus.style.color = "#b91c1c";
      submissionStatus.textContent = err.message || "Could not load requests.";
    }
  }
}

if (refreshSubmissionsBtn) {
  refreshSubmissionsBtn.addEventListener("click", () => loadSubmissions());
}

function setSubmissionStatus(message, isError = false) {
  if (!submissionStatus) return;
  submissionStatus.style.color = isError ? "#b91c1c" : "";
  submissionStatus.textContent = message;
}

async function submissionAction(payload) {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in required.");
  const token = await user.getIdToken();
  const response = await fetch("/api/submissions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || "Request failed.");
  return data;
}

if (submissionList) {
  submissionList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-id]");
    if (!button) return;

    const name = button.dataset.deleteName;
    if (!window.confirm(`Permanently delete the request from ${name}, including any photos? This cannot be undone.`)) return;

    button.disabled = true;
    try {
      const result = await submissionAction({ action: "delete", id: button.dataset.deleteId });
      await loadSubmissions();
      setSubmissionStatus(
        `Deleted request from ${name}${result.photosDeleted ? ` and ${result.photosDeleted} photo(s)` : ""}.`
      );
    } catch (err) {
      button.disabled = false;
      setSubmissionStatus(err.message || "Could not delete the request.", true);
    }
  });
}

if (cleanupPhotosBtn) {
  cleanupPhotosBtn.addEventListener("click", async () => {
    if (!window.confirm("Delete uploaded photos that don't belong to any request (for example, from forms that were never submitted)? Photos on existing requests are kept.")) return;

    cleanupPhotosBtn.disabled = true;
    setSubmissionStatus("Cleaning up photo storage...");
    try {
      const result = await submissionAction({ action: "cleanup" });
      const mb = (result.bytes / (1024 * 1024)).toFixed(1);
      setSubmissionStatus(
        result.deleted
          ? `Removed ${result.deleted} unused photo(s), freeing ${mb} MB. ${result.kept} photo(s) kept.`
          : `Nothing to clean up. ${result.kept} photo(s) in use or recently uploaded.`
      );
    } catch (err) {
      setSubmissionStatus(err.message || "Cleanup failed.", true);
    } finally {
      cleanupPhotosBtn.disabled = false;
    }
  });
}

function populateForm(data) {
  form.querySelectorAll("[name]").forEach((field) => {
    const value = getDeep(data, field.name);
    field.value = typeof value === "string" ? value : "";
  });
  reviews = (Array.isArray(data.reviews) ? data.reviews : []).map((r) => ({ ...r }));
  renderReviews();
}

function collectForm() {
  const data = {};
  form.querySelectorAll("[name]").forEach((field) => {
    setDeep(data, field.name, field.value.trim());
  });
  data.reviews = collectReviews();
  return data;
}

if (!isConfigured()) {
  authCard.classList.remove("hidden");
  signInBtn.disabled = true;
  saveStatus.textContent = "Configure js/firebase-config.js before using the admin dashboard.";
  saveStatus.style.color = "#b91c1c";
  throw new Error("Firebase config is missing");
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

signInBtn.addEventListener("click", async () => {
  saveStatus.textContent = "Signing in...";
  try {
    await signInWithPopup(auth, provider);
    saveStatus.textContent = "";
  } catch (err) {
    saveStatus.textContent = "Google sign-in failed.";
    saveStatus.style.color = "#b91c1c";
    console.error(err);
  }
});

signOutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

saveBtn.addEventListener("click", async () => {
  const user = auth.currentUser;
  const userEmail = (user && user.email ? user.email : "").toLowerCase();
  const allowedEmails = ADMIN_EMAILS.map((email) => email.toLowerCase());
  if (!user || !allowedEmails.includes(userEmail)) {
    saveStatus.textContent = "You are not authorized to save.";
    saveStatus.style.color = "#b91c1c";
    return;
  }

  saveBtn.disabled = true;
  saveStatus.textContent = "Saving...";
  saveStatus.style.color = "#1f2937";

  try {
    const payload = collectForm();
    await setDoc(doc(db, "site", "content"), payload, { merge: true });
    saveStatus.textContent = "Saved successfully. Refresh public pages to verify updates.";
    saveStatus.style.color = "#15803d";
  } catch (err) {
    saveStatus.textContent = "Save failed. Check console for details.";
    saveStatus.style.color = "#b91c1c";
    console.error(err);
  } finally {
    saveBtn.disabled = false;
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    adminPanel.classList.add("hidden");
    authCard.classList.remove("hidden");
    return;
  }

  const userEmail = (user.email || "").toLowerCase();
  const allowedEmails = ADMIN_EMAILS.map((email) => email.toLowerCase());
  if (!allowedEmails.includes(userEmail)) {
    adminPanel.classList.add("hidden");
    authCard.classList.remove("hidden");
    saveStatus.textContent = "Signed in, but this account is not on the admin allow-list.";
    saveStatus.style.color = "#b91c1c";
    await signOut(auth);
    return;
  }

  authCard.classList.add("hidden");
  adminPanel.classList.remove("hidden");
  signedInAs.textContent = `Signed in as ${user.email}`;

  try {
    const snap = await getDoc(doc(db, "site", "content"));
    const data = deepMerge(defaults, snap.exists() ? snap.data() : {});
    populateForm(data);
  } catch (err) {
    saveStatus.textContent = "Could not load current content. Defaults were used.";
    saveStatus.style.color = "#b91c1c";
    populateForm(defaults);
    console.error(err);
  }

  loadSubmissions();
});
