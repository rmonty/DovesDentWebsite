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
  }
};

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

function populateForm(data) {
  form.querySelectorAll("[name]").forEach((field) => {
    const value = getDeep(data, field.name);
    field.value = typeof value === "string" ? value : "";
  });
}

function collectForm() {
  const data = {};
  form.querySelectorAll("[name]").forEach((field) => {
    setDeep(data, field.name, field.value.trim());
  });
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
});
