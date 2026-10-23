/* Doves Dent Hail Repair — main.js */

const MAX_FILES = 8;
const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.85;

// ── Sticky nav shadow ──
const nav = document.getElementById("navbar");
if (nav) {
  window.addEventListener("scroll", () => {
    nav.classList.toggle("scrolled", window.scrollY > 50);
  });
}

// ── Hamburger ──
const hamburger = document.getElementById("hamburger");
const navLinks = document.getElementById("navLinks");
if (hamburger && navLinks) {
  hamburger.addEventListener("click", () => {
    hamburger.classList.toggle("open");
    navLinks.classList.toggle("open");
  });
  // close on link click
  navLinks.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => {
      hamburger.classList.remove("open");
      navLinks.classList.remove("open");
    });
  });
}

// ── FAQ accordion ──
document.querySelectorAll(".faq-q").forEach((btn) => {
  btn.addEventListener("click", () => {
    const item = btn.parentElement;
    const isOpen = item.classList.contains("open");
    document.querySelectorAll(".faq-item").forEach((i) => i.classList.remove("open"));
    if (!isOpen) item.classList.add("open");
  });
});

// ── Smooth scroll ──
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
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

// ── Active nav link highlight ──
const currentPage = window.location.pathname.split("/").pop() || "index.html";
document.querySelectorAll(".nav-links a").forEach((a) => {
  if (a.getAttribute("href") === currentPage) {
    a.style.color = "var(--accent)";
  }
});

// ── Contact form + photo upload ──
const form = document.getElementById("contactForm");
if (form) {
  const photoInput = document.getElementById("photoInput");
  const preview = document.getElementById("photoPreview");
  const imageKeysInput = document.getElementById("imageKeys");
  const uploadStatus = document.getElementById("uploadStatus");
  const photoHint = document.getElementById("photoHint");

  const selectedFiles = [];
  let busy = false;

  function setStatus(message, tone) {
    if (!uploadStatus) return;
    uploadStatus.textContent = message || "";
    uploadStatus.dataset.tone = tone || "";
  }

  function updateHint() {
    if (!photoHint) return;
    photoHint.textContent =
      selectedFiles.length === 0
        ? `Add up to ${MAX_FILES} photos. Clear, well-lit shots of the damage help us estimate faster.`
        : `${selectedFiles.length} of ${MAX_FILES} photos selected.`;
  }

  function renderPreview() {
    if (!preview) return;
    preview.innerHTML = "";
    selectedFiles.forEach((entry, index) => {
      const wrap = document.createElement("div");
      wrap.className = "photo-thumb";

      const img = document.createElement("img");
      img.alt = entry.file.name;
      img.src = entry.objectUrl;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "photo-remove";
      remove.setAttribute("aria-label", `Remove ${entry.file.name}`);
      remove.textContent = "\u00d7";
      remove.addEventListener("click", () => {
        URL.revokeObjectURL(entry.objectUrl);
        selectedFiles.splice(index, 1);
        renderPreview();
        updateHint();
      });

      wrap.appendChild(img);
      wrap.appendChild(remove);
      preview.appendChild(wrap);
    });
  }

  if (photoInput) {
    photoInput.addEventListener("change", () => {
      const incoming = Array.from(photoInput.files || []);
      for (const file of incoming) {
        if (selectedFiles.length >= MAX_FILES) {
          setStatus(`You can add up to ${MAX_FILES} photos.`, "warn");
          break;
        }
        if (!file.type.startsWith("image/")) {
          setStatus(`${file.name} is not an image.`, "warn");
          continue;
        }
        if (file.size > MAX_ORIGINAL_BYTES) {
          setStatus(`${file.name} is too large (max 25 MB per photo).`, "warn");
          continue;
        }
        const duplicate = selectedFiles.some(
          (entry) => entry.file.name === file.name && entry.file.size === file.size
        );
        if (duplicate) continue;
        selectedFiles.push({ file, objectUrl: URL.createObjectURL(file) });
      }
      photoInput.value = "";
      renderPreview();
      updateHint();
    });
  }

  updateHint();

  // Downscale and re-encode to keep uploads small and fast on mobile.
  async function prepareForUpload(file) {
    if (file.type === "image/heic" || file.type === "image/heif") {
      // Canvas cannot reliably decode HEIC, so send it as-is.
      return file;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      if (bitmap.close) bitmap.close();

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
      if (!blob) return file;

      const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
      return new File([blob], name, { type: "image/jpeg" });
    } catch {
      return file;
    }
  }

  async function uploadPhoto(file) {
    const body = new FormData();
    body.append("file", file);
    const response = await fetch("/api/upload", { method: "POST", body });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok || !data.key) {
      throw new Error(data.error || "Photo upload failed.");
    }
    return data.key;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector(".btn-submit");
    if (!btn || busy) return;

    const originalText = btn.textContent;
    busy = true;
    btn.disabled = true;

    try {
      const keys = [];

      if (selectedFiles.length > 0) {
        const prepared = [];
        for (let i = 0; i < selectedFiles.length; i += 1) {
          btn.textContent = `Preparing photo ${i + 1} of ${selectedFiles.length}...`;
          setStatus(`Preparing photo ${i + 1} of ${selectedFiles.length}...`);
          const file = await prepareForUpload(selectedFiles[i].file);
          if (file.size > MAX_UPLOAD_BYTES) {
            throw new Error(
              `${selectedFiles[i].file.name} is still too large after compressing. Please choose a smaller photo.`
            );
          }
          prepared.push(file);
        }

        for (let i = 0; i < prepared.length; i += 1) {
          btn.textContent = `Uploading photo ${i + 1} of ${prepared.length}...`;
          setStatus(`Uploading photo ${i + 1} of ${prepared.length}...`);
          keys.push(await uploadPhoto(prepared[i]));
        }
      }

      if (imageKeysInput) imageKeysInput.value = JSON.stringify(keys);

      btn.textContent = "Sending...";
      setStatus("Sending your request...");

      const response = await fetch(form.action || "/api/contact", {
        method: "POST",
        body: new FormData(form)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        throw new Error(data.error || "Request failed");
      }

      btn.textContent = "Request Sent! Aaron will call within 1 hour.";
      btn.style.background = "#15803d";
      btn.style.borderColor = "#15803d";
      setStatus("Your request and photos were received.", "ok");
      form.reset();
      selectedFiles.forEach((entry) => URL.revokeObjectURL(entry.objectUrl));
      selectedFiles.length = 0;
      renderPreview();
      updateHint();
    } catch (err) {
      btn.textContent = (err && err.message) || "Could not send. Please call 806-438-8209.";
      btn.style.background = "#b91c1c";
      btn.style.borderColor = "#b91c1c";
      setStatus("", "");
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = "";
        btn.style.borderColor = "";
      }, 5000);
    } finally {
      busy = false;
      btn.disabled = false;
    }
  });
}
