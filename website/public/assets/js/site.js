/* ============================================================
   FORM SETUP: paste your Zapier "Catch Hook" URL between the quotes, e.g.
   const FORM_ENDPOINT = "https://hooks.zapier.com/hooks/catch/123456/abcdef/";
   Until it's set, the form tells visitors to call instead of
   silently dropping leads. This one setting covers every page.
   ============================================================ */
const FORM_ENDPOINT = "";

const PHONE_DISPLAY = "(415) 770-0722";
const PHONE_TEL = "+14157700722";

/* "Get my offer" links jump to this page's form, or go to the contact page
   on pages that don't have one. */
(function () {
  const form = document.getElementById("offer");
  document.querySelectorAll("[data-offer-link]").forEach(function (link) {
    if (!form) link.setAttribute("href", "/contact-us/");
  });
})();

(function () {
  const form = document.querySelector("[data-offer-form]");
  if (!form) return;
  const msg = form.querySelector(".form-msg");
  const button = form.querySelector('button[type="submit"]');
  const buttonText = button.textContent;

  // Carry ad / campaign parameters through to the lead.
  const params = new URLSearchParams(location.search);
  const tracking = {};
  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"].forEach(function (k) {
    if (params.get(k)) tracking[k] = params.get(k);
  });

  function show(kind, html) {
    msg.className = "form-msg " + kind;
    msg.innerHTML = html;
  }
  const callLink = '<a href="tel:' + PHONE_TEL + '">' + PHONE_DISPLAY + "</a>";
  const callButton = '<a class="btn btn-gold" href="tel:' + PHONE_TEL + '">Call ' + PHONE_DISPLAY + "</a>";

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    msg.className = "form-msg";

    const missing = ["address", "name", "phone"].filter(function (id) { return !form[id].value.trim(); });
    if (missing.length) {
      show("err", "Please add your address, name, and phone so we can reach you.");
      form[missing[0]].focus();
      return;
    }
    const digits = form.phone.value.replace(/\D/g, "");
    if (!(digits.length === 10 || (digits.length === 11 && digits[0] === "1"))) {
      show("err", "Please enter a 10-digit phone number.");
      form.phone.focus();
      return;
    }
    if (form.email.value.trim() && !form.email.checkValidity()) {
      show("err", "Please check your email address, or leave it blank.");
      form.email.focus();
      return;
    }
    if (form.company && form.company.value) return; // hidden field only bots fill in

    if (!FORM_ENDPOINT) {
      console.warn("FORM_ENDPOINT is not set in /assets/js/site.js, so this lead was not sent.");
      show("err", "Form isn't connected yet. Please call " + callLink + "." + callButton);
      return;
    }

    const data = new URLSearchParams();
    ["address", "name", "phone", "email", "timeline", "situation"].forEach(function (k) {
      data.append(k, form[k].value.trim());
    });
    const consent = form.querySelector("[data-consent]");
    data.append("consent_text", consent ? consent.textContent.trim() : "");
    data.append("page_url", location.href);
    data.append("page_title", document.title);
    data.append("referrer", document.referrer);
    data.append("submitted_at", new Date().toISOString());
    data.append("source", "believetheprocess.com");
    Object.keys(tracking).forEach(function (k) { data.append(k, tracking[k]); });

    button.disabled = true;
    button.textContent = "Sending...";
    try {
      // Form-encoded POST is a "simple" request, which Zapier catch hooks accept from a browser.
      const res = await fetch(FORM_ENDPOINT, { method: "POST", body: data });
      if (!res.ok) throw new Error("HTTP " + res.status);
      form.reset();
      show("ok", "Got it. We'll reach out today about your property.");
      if (typeof window.gtag === "function") window.gtag("event", "generate_lead");
    } catch (err) {
      console.error("Offer form failed:", err);
      show("err", "That didn't go through. Please call " + callLink + "." + callButton);
    } finally {
      button.disabled = false;
      button.textContent = buttonText;
    }
  });
})();
