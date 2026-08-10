import { z } from "zod";
import { fub } from "../fubClient.js";
import { sendSms, fromNumber as twilioFromNumber } from "../twilioClient.js";
import { realGeeks } from "../realGeeksClient.js";

function textResult(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }] };
}

function errorResult(err) {
  return {
    content: [{ type: "text", text: `Error: ${err.message}` }],
    isError: true,
  };
}

/**
 * Registers all Follow Up Boss (+ Twilio, Real Geeks) tools on the given McpServer instance.
 * Each handler talks to the FUB REST API through the shared `fub` client,
 * which attaches Basic Auth + X-System / X-System-Key on every call.
 */
export function registerFubTools(server) {
  // list_leads - browse/filter people, e.g. by pipeline stage
  server.registerTool(
    "list_leads",
    {
      title: "List Leads",
      description:
        "List leads/contacts (people) from Follow Up Boss. Supports filtering by " +
        "pipeline stage, sorting by last-updated date, and limiting result count.",
      inputSchema: {
        stage: z
          .string()
          .optional()
          .describe("Filter by pipeline stage, e.g. 'Lead', 'Hot', 'Under Contract'."),
        sort: z
          .enum(["updated", "-updated", "created", "-created", "name", "-name"])
          .optional()
          .default("-updated")
          .describe("Sort order. Prefix with '-' for descending. Defaults to most recently updated first."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(20)
          .describe("Max number of leads to return (1-100). Defaults to 20."),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .default(0)
          .describe("Pagination offset."),
      },
    },
    async ({ stage, sort, limit, offset }) => {
      try {
        const data = await fub.get("/people", {
          stage,
          sort,
          limit,
          offset,
          fields: "id,firstName,lastName,stage,source,assignedTo,tags,emails,phones,created,updated",
        });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // get_lead - full detail for one person, plus related activity
  server.registerTool(
    "get_lead",
    {
      title: "Get Lead Detail",
      description:
        "Get full detail for a single lead/contact by person id, including their " +
        "notes, logged calls, logged text messages, and logged emails.",
      inputSchema: {
        personId: z.number().int().describe("The Follow Up Boss person id."),
        includeNotes: z.boolean().optional().default(true),
        includeCalls: z.boolean().optional().default(true),
        includeTexts: z.boolean().optional().default(true),
        includeEmails: z.boolean().optional().default(true),
      },
    },
    async ({ personId, includeNotes, includeCalls, includeTexts, includeEmails }) => {
      try {
        const person = await fub.get(`/people/${personId}`, { fields: "allFields" });

        const [notes, calls, texts, emails] = await Promise.all([
          includeNotes
            ? fub.get("/notes", { personId, limit: 50, sort: "-created" }).catch((e) => ({ error: e.message }))
            : null,
          includeCalls
            ? fub.get("/calls", { personId, limit: 50, sort: "-created" }).catch((e) => ({ error: e.message }))
            : null,
          includeTexts
            ? fub
                .get("/textMessages", { personId, limit: 50, sort: "-created" })
                .catch((e) => ({ error: e.message }))
            : null,
          includeEmails
            ? fub.get("/emails", { personId, limit: 50, sort: "-created" }).catch((e) => ({ error: e.message }))
            : null,
        ]);

        return textResult({
          person,
          notes: notes ?? undefined,
          calls: calls ?? undefined,
          textMessages: texts ?? undefined,
          emails: emails ?? undefined,
        });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // search_leads - by name / phone / email
  server.registerTool(
    "search_leads",
    {
      title: "Search Leads",
      description:
        "Search for leads/contacts in Follow Up Boss by name, phone number, or email address. " +
        "Provide at least one of the three.",
      inputSchema: {
        name: z.string().optional().describe("Full or partial name to search for."),
        phone: z.string().optional().describe("Phone number to search for."),
        email: z.string().optional().describe("Email address to search for."),
        limit: z.number().int().min(1).max(100).optional().default(20),
      },
    },
    async ({ name, phone, email, limit }) => {
      if (!name && !phone && !email) {
        return errorResult(new Error("Provide at least one of: name, phone, email."));
      }
      try {
        const data = await fub.get("/people", {
          name,
          phone,
          email,
          limit,
          fields: "id,firstName,lastName,stage,source,tags,emails,phones,created,updated",
        });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // add_lead - create a new person
  server.registerTool(
    "add_lead",
    {
      title: "Add Lead",
      description:
        "Create a new person (lead/contact) in Follow Up Boss. Note: this creates the " +
        "contact record directly and will NOT trigger lead-routing automations or " +
        "action plans - those only fire off event notifications (POST /v1/events) " +
        "from a registered lead source. Use this tool for manual contact creation, " +
        "then use apply_action_plan if you want to enroll the new lead in a sequence.",
      inputSchema: {
        firstName: z.string().describe("Lead's first name."),
        lastName: z.string().optional().describe("Lead's last name."),
        email: z.string().email().optional().describe("Primary email address."),
        phone: z.string().optional().describe("Primary phone number."),
        stage: z.string().optional().describe("Pipeline stage to place the new lead in."),
        source: z.string().optional().describe("Lead source label, e.g. 'Website', 'Referral'."),
        assignedTo: z.string().optional().describe("Name or id of the agent to assign this lead to."),
        tags: z
          .array(z.string())
          .optional()
          .describe("Tags to apply to the new lead, e.g. ['Hot Lead', 'Buyer']."),
        background: z
          .string()
          .optional()
          .describe("Free-text background/notes to store on the person record."),
      },
    },
    async ({ firstName, lastName, email, phone, stage, source, assignedTo, tags, background }) => {
      try {
        const body = {
          firstName,
          ...(lastName && { lastName }),
          ...(email && { emails: [{ value: email }] }),
          ...(phone && { phones: [{ value: phone }] }),
          ...(stage && { stage }),
          ...(source && { source }),
          ...(assignedTo && { assignedTo }),
          ...(tags && tags.length > 0 && { tags }),
          ...(background && { background }),
        };
        const data = await fub.post("/people", body);
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // add_note - attach a note to a person
  server.registerTool(
    "add_note",
    {
      title: "Add Note",
      description: "Attach a note to an existing person in Follow Up Boss.",
      inputSchema: {
        personId: z.number().int().describe("The Follow Up Boss person id to attach the note to."),
        subject: z.string().optional().describe("Optional short subject line for the note."),
        body: z.string().describe("The note content."),
        isHtml: z.boolean().optional().default(false).describe("Whether `body` contains HTML."),
      },
    },
    async ({ personId, subject, body, isHtml }) => {
      try {
        const data = await fub.post("/notes", {
          personId,
          ...(subject && { subject }),
          body,
          isHtml,
        });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // send_text - actually deliver an SMS via Twilio, then log it on the FUB timeline
  server.registerTool(
    "send_text",
    {
      title: "Send Text Message",
      description:
        "Send a real SMS to a lead via Twilio, then log it on the person's Follow Up Boss " +
        "timeline. Follow Up Boss's own /textMessages endpoint only records logs and does " +
        "not deliver anything, so this tool sends through Twilio first and logs the result " +
        "afterwards. Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER " +
        "to be configured.",
      inputSchema: {
        personId: z.number().int().describe("The Follow Up Boss person id to text and log against."),
        message: z.string().describe("The text message body to send."),
        toNumber: z
          .string()
          .optional()
          .describe(
            "Phone number to text, e.g. '+15125551234'. If omitted, the person's primary phone number on file in Follow Up Boss is used."
          ),
      },
    },
    async ({ personId, message, toNumber }) => {
      try {
        let to = toNumber;
        if (!to) {
          const person = await fub.get(`/people/${personId}`, { fields: "phones" });
          const primaryPhone =
            person?.phones?.find((p) => p.isPrimary)?.value ?? person?.phones?.[0]?.value;
          if (!primaryPhone) {
            return errorResult(
              new Error(`No toNumber provided and person ${personId} has no phone number on file.`)
            );
          }
          to = primaryPhone;
        }

        const sms = await sendSms({ to, body: message });

        const logged = await fub
          .post("/textMessages", {
            personId,
            message,
            toNumber: to,
            fromNumber: twilioFromNumber(),
            isIncoming: false,
          })
          .catch((e) => ({ error: `Sent via Twilio but failed to log in Follow Up Boss: ${e.message}` }));

        return textResult({
          twilio: { sid: sms.sid, status: sms.status, to: sms.to, from: sms.from },
          fubLog: logged,
        });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // list_action_plans - browse the sequences configured in FUB
  server.registerTool(
    "list_action_plans",
    {
      title: "List Action Plans",
      description:
        "List the Action Plans (follow-up sequences) configured in Follow Up Boss, e.g. " +
        "'Qualify Buyer Leads' or 'New Facebook Lead - Downsizing'. Use this to find an " +
        "actionPlanId before calling apply_action_plan. Note: the FUB API can only list and " +
        "enroll people into existing action plans - it cannot create or edit the steps/content " +
        "of a plan. New or edited sequences must be built in the Follow Up Boss UI (Automations).",
      inputSchema: {
        status: z
          .enum(["Active", "Deleted", "both"])
          .optional()
          .describe("Filter by status. Defaults to Active-only server behavior."),
        names: z.array(z.string()).optional().describe("Filter to action plans matching these names."),
        limit: z.number().int().min(1).max(100).optional().default(20),
      },
    },
    async ({ status, names, limit }) => {
      try {
        const data = await fub.get("/actionPlans", { status, names, limit });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // apply_action_plan - enroll a person into an existing sequence
  server.registerTool(
    "apply_action_plan",
    {
      title: "Apply Action Plan",
      description:
        "Enroll a lead in an existing Follow Up Boss Action Plan (follow-up sequence) by id. " +
        "Look up the actionPlanId with list_action_plans first.",
      inputSchema: {
        personId: z.number().int().describe("The Follow Up Boss person id to enroll."),
        actionPlanId: z.number().int().describe("The Follow Up Boss action plan id to apply."),
      },
    },
    async ({ personId, actionPlanId }) => {
      try {
        const data = await fub.post("/actionPlansPeople", { personId, actionPlanId });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // sync_lead_to_realgeeks - push a FUB person into a Real Geeks site as a lead
  server.registerTool(
    "sync_lead_to_realgeeks",
    {
      title: "Sync Lead to Real Geeks",
      description:
        "Push a Follow Up Boss lead into a Real Geeks site via the Real Geeks Incoming Leads " +
        "API, so a search alert / IDX drip can be set up for them there. Requires " +
        "REALGEEKS_USERNAME, REALGEEKS_PASSWORD, and REALGEEKS_SITE_UUID to be configured - " +
        "these are partner credentials issued by Real Geeks, not self-generated.",
      inputSchema: {
        personId: z.number().int().describe("The Follow Up Boss person id to sync."),
        notes: z.string().optional().describe("Optional note to attach to the Real Geeks lead."),
      },
    },
    async ({ personId, notes }) => {
      try {
        const person = await fub.get(`/people/${personId}`, {
          fields: "firstName,lastName,emails,phones,addresses",
        });

        const email = person?.emails?.find((e) => e.isPrimary)?.value ?? person?.emails?.[0]?.value;
        const phone = person?.phones?.find((p) => p.isPrimary)?.value ?? person?.phones?.[0]?.value;
        const address = person?.addresses?.[0];

        const lead = {
          first_name: person.firstName,
          ...(person.lastName && { last_name: person.lastName }),
          ...(email && { email }),
          ...(phone && { phone }),
          ...(address?.street && { street_address: address.street }),
          ...(address?.city && { city: address.city }),
          ...(address?.state && { state: address.state }),
          ...(address?.code && { zip: address.code }),
          ...(notes && { notes }),
        };

        const data = await realGeeks.createLead(lead);
        return textResult({ synced: lead, realGeeksResponse: data });
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}
