import { z } from "zod";
import { fub } from "../fubClient.js";

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
 * Registers all Follow Up Boss tools on the given McpServer instance.
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
          fields: "id,firstName,lastName,stage,source,assignedTo,emails,phones,created,updated",
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
          fields: "id,firstName,lastName,stage,source,emails,phones,created,updated",
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
        "from a registered lead source. Use this tool for manual contact creation. " +
        "Use create_lead_event instead if the lead's source has an Action Plan that " +
        "should auto-assign.",
      inputSchema: {
        firstName: z.string().describe("Lead's first name."),
        lastName: z.string().optional().describe("Lead's last name."),
        email: z.string().email().optional().describe("Primary email address."),
        phone: z.string().optional().describe("Primary phone number."),
        stage: z.string().optional().describe("Pipeline stage to place the new lead in."),
        source: z.string().optional().describe("Lead source label, e.g. 'Website', 'Referral'."),
        assignedTo: z.string().optional().describe("Name or id of the agent to assign this lead to."),
        background: z
          .string()
          .optional()
          .describe("Free-text background/notes to store on the person record."),
      },
    },
    async ({ firstName, lastName, email, phone, stage, source, assignedTo, background }) => {
      try {
        const body = {
          firstName,
          ...(lastName && { lastName }),
          ...(email && { emails: [{ value: email }] }),
          ...(phone && { phones: [{ value: phone }] }),
          ...(stage && { stage }),
          ...(source && { source }),
          ...(assignedTo && { assignedTo }),
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

  // create_lead_event - the only path that triggers FUB action plans / lead routing
  server.registerTool(
    "create_lead_event",
    {
      title: "Create Lead Event",
      description:
        "Send a lead to Follow Up Boss via the events API (POST /v1/events) - the only " +
        "path that triggers FUB's automatic lead-routing and Action Plan assignment. " +
        "The `source` value must exactly match a Lead Source configured under Admin > " +
        "Lead Flow in the FUB account (with an Action Plan mapped to it) for anything " +
        "to auto-fire; otherwise the event is just logged. Only these event types " +
        "trigger automations: Registration, Seller Inquiry, Property Inquiry, " +
        "General Inquiry, Visited Open House.",
      inputSchema: {
        type: z
          .enum([
            "Registration",
            "Inquiry",
            "Seller Inquiry",
            "Property Inquiry",
            "General Inquiry",
            "Viewed Property",
            "Saved Property",
            "Visited Website",
            "Incoming Call",
            "Unsubscribed",
            "Property Search",
            "Saved Property Search",
            "Visited Open House",
            "Viewed Page",
          ])
          .describe(
            "FUB event type. Only Registration, Seller Inquiry, Property Inquiry, " +
              "General Inquiry, and Visited Open House trigger action plans/automations."
          ),
        source: z
          .string()
          .describe(
            "Lead source name, e.g. 'Referral Exchange' or 'Speed to Lead'. Must match a " +
              "source configured in Admin > Lead Flow for an action plan to auto-assign."
          ),
        firstName: z.string().describe("Lead's first name."),
        lastName: z.string().optional().describe("Lead's last name."),
        email: z.string().email().optional().describe("Primary email address."),
        phone: z.string().optional().describe("Primary phone number."),
        message: z.string().optional().describe("Free-text inquiry message/context for this event."),
      },
    },
    async ({ type, source, firstName, lastName, email, phone, message }) => {
      try {
        const body = {
          type,
          source,
          person: {
            firstName,
            ...(lastName && { lastName }),
            ...(email && { emails: [{ value: email }] }),
            ...(phone && { phones: [{ value: phone }] }),
          },
          ...(message && { message }),
        };
        const data = await fub.post("/events", body);
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}
