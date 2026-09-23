/* ============================================================
   SETTINGS
   Paste your Zapier "Catch Hook" URL between the quotes, e.g.
   const FORM_ENDPOINT = "https://hooks.zapier.com/hooks/catch/123456/abcdef/";
   While it is empty, the form tells visitors to call instead of
   pretending to submit, so no lead is ever silently lost.
   ============================================================ */
const FORM_ENDPOINT = "";

const PHONE_DISPLAY = "(415) 770-0722";
const PHONE_TEL = "+14157700722";

/* ---------- Mobile menu ---------- */
(function () {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("main-nav");
  if (!toggle || !nav) return;
  toggle.addEventListener("click", function () {
    const open = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!open));
    document.body.classList.toggle("nav-open", !open);
  });
  nav.addEventListener("click", function (e) {
    if (e.target.closest("a")) {
      toggle.setAttribute("aria-expanded", "false");
      document.body.classList.remove("nav-open");
    }
  });
})();

/* ---------- "Get offer" links: jump to this page's form, or the offer page ---------- */
(function () {
  const form = document.getElementById("offer");
  document.querySelectorAll("[data-offer-link]").forEach(function (link) {
    if (!form) {
      link.setAttribute("href", "/get-your-offer/");
      return;
    }
    link.addEventListener("click", function (e) {
      e.preventDefault();
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      const address = form.querySelector('[name="address"]');
      if (address) setTimeout(function () { address.focus({ preventScroll: true }); }, 400);
    });
  });
})();

/* ---------- Offer form ---------- */
(function () {
  const form = document.querySelector("[data-offer-form]");
  if (!form) return;

  const step1 = form.querySelector('[data-step="1"]');
  const step2 = form.querySelector('[data-step="2"]');
  const status = form.querySelector(".form-status");
  const submitBtn = form.querySelector('button[type="submit"]');
  form.classList.add("js-steps");

  // Carry UTM / ad-click parameters through to the lead.
  const params = new URLSearchParams(location.search);
  const tracking = {};
  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"].forEach(function (k) {
    if (params.get(k)) tracking[k] = params.get(k);
  });

  function showStatus(html, kind) {
    status.innerHTML = html;
    status.className = "form-status " + (kind || "");
    status.hidden = false;
    status.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function callFallback(intro) {
    return (
      "<strong>" + intro + "</strong>" +
      '<p>Please call us at <a href="tel:' + PHONE_TEL + '">' + PHONE_DISPLAY + "</a> and we&rsquo;ll get your offer started right away.</p>" +
      '<a class="btn btn-gold btn-block" href="tel:' + PHONE_TEL + '">Call ' + PHONE_DISPLAY + "</a>"
    );
  }

  function checkFields(container) {
    const fields = container.querySelectorAll("input[required], select[required]");
    for (const field of fields) {
      if (field.name === "phone") {
        const digits = field.value.replace(/\D/g, "");
        field.setCustomValidity(digits.length === 10 || (digits.length === 11 && digits[0] === "1") ? "" : "Please enter a 10-digit phone number.");
      }
      if (!field.checkValidity()) {
        field.reportValidity();
        field.focus();
        return false;
      }
    }
    return true;
  }

  function goToStep2() {
    if (!checkFields(step1)) return;
    form.classList.add("on-step-2");
    const first = step2.querySelector("input");
    if (first) first.focus();
  }

  form.querySelector("[data-next]").addEventListener("click", goToStep2);
  step1.querySelector("input").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      goToStep2();
    }
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!form.classList.contains("on-step-2")) return goToStep2();
    if (!checkFields(step1) || !checkFields(step2)) return;

    const data = new FormData(form);
    if (data.get("company")) return; // honeypot: bots fill hidden fields

    if (!FORM_ENDPOINT) {
      console.warn("FORM_ENDPOINT is not set in /assets/js/site.js - lead was not sent.");
      showStatus(callFallback("Thanks! Our online form is being set up."), "is-warning");
      return;
    }

    const payload = new URLSearchParams();
    ["address", "name", "phone", "email", "timeline", "situation"].forEach(function (k) {
      payload.append(k, (data.get(k) || "").toString().trim());
    });
    payload.append("sms_consent", data.get("sms_consent") === "yes" ? "yes" : "no");
    payload.append("consent_text", form.querySelector(".consent span").textContent.trim());
    payload.append("page_url", location.href);
    payload.append("page_title", document.title);
    payload.append("referrer", document.referrer);
    payload.append("submitted_at", new Date().toISOString());
    payload.append("source", "believetheprocess.com");
    Object.keys(tracking).forEach(function (k) { payload.append(k, tracking[k]); });

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";
    try {
      // Form-encoded POST = a "simple" request, which Zapier catch hooks accept without a CORS preflight.
      const res = await fetch(FORM_ENDPOINT, { method: "POST", body: payload });
      if (!res.ok) throw new Error("HTTP " + res.status);
      step1.hidden = true;
      step2.hidden = true;
      showStatus(
        "<strong>Got it. Thank you!</strong>" +
          "<p>WeWe&rsquo;ll reach out shortly, usually the same day.rsquo;ll be in touch shortly to set up a time to see the property. If it&rsquo;s urgent, call <a href=\"tel:" + PHONE_TEL + "\">" + PHONE_DISPLAY + "</a>.</p>",
        "is-success"
      );
      if (typeof window.gtag === "function") window.gtag("event", "generate_lead");
    } catch (err) {
      console.error("Offer form failed:", err);
      showStatus(callFallback("Sorry, something went wrong sending your info."), "is-warning");
      submitBtn.disabled = false;
      submitBtn.textContent = "Try Again";
    }
  });
})();
