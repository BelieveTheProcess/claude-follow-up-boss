// Public, unauthenticated /unsubscribe endpoint - the other half of the
// CAN-SPAM mechanics in emailCompliance.js. Recipients reach this by
// clicking the link in the footer of every email send_email sends; no
// bearer token is required (they're not MCP clients), so the HMAC token in
// the link itself is what prevents someone from unsubscribing a person they
// don't have the original email for.

import { fub } from "./fubClient.js";
import { verifyUnsubscribeToken, DO_NOT_EMAIL_TAG } from "./emailCompliance.js";

function htmlPage(message) {
  return `<!doctype html>
<html>
<head><title>Unsubscribe</title></head>
<body style="font-family: sans-serif; max-width: 480px; margin: 80px auto; text-align: center;">
  <p>${message}</p>
</body>
</html>`;
}

export function registerUnsubscribeRoute(app, rateLimit) {
  app.get("/unsubscribe", rateLimit, async (req, res) => {
    const { personId, email, token } = req.query;

    if (!personId || !email || !verifyUnsubscribeToken(personId, email, token)) {
      res.status(400).set("Content-Type", "text/html").send(htmlPage("Invalid or expired unsubscribe link."));
      return;
    }

    try {
      const person = await fub.get(`/people/${personId}`, { fields: "tags" });
      const existingTags = person?.tags || [];
      if (!existingTags.includes(DO_NOT_EMAIL_TAG)) {
        await fub.put(`/people/${personId}`, { tags: [...existingTags, DO_NOT_EMAIL_TAG] });
      }
    } catch (err) {
      console.error(`[unsubscribe] failed to tag person ${personId}:`, err.message);
      res.status(500).set("Content-Type", "text/html").send(
        htmlPage("Something went wrong processing your request. Please contact us directly to be removed from our list.")
      );
      return;
    }

    res.status(200).set("Content-Type", "text/html").send(
      htmlPage("You've been unsubscribed and won't receive further emails from us. Sorry to see you go.")
    );
  });
}
