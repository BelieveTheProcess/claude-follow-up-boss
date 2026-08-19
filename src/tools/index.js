import { z } from "zod";
import { fub } from "../fubClient.js";
import { sendSms, fromNumber as twilioFromNumber } from "../twilioClient.js";
import { realGeeks } from "../realGeeksClient.js";
import { postToSlack } from "../slackClient.js";
import { dealMachine } from "../dealMachineClient.js";

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

  // create_lead_event - the ONLY path that triggers FUB lead-routing/action plans
  server.registerTool(
    "create_lead_event",
    {
      title: "Create Lead Event",
      description:
        "Send a lead to Follow Up Boss via the events API (POST /v1/events) - the only path " +
        "that triggers FUB's automatic lead-routing and Action Plan assignment. The `source` " +
        "value must exactly match a Lead Source configured under Admin > Lead Flow in the FUB " +
        "account (with an Action Plan mapped to it) for anything to auto-fire; otherwise the " +
        "event is just logged like add_lead. Only these event types trigger automations: " +
        "Registration, Seller Inquiry, Property Inquiry, General Inquiry, Visited Open House. " +
        "Pass personId to update an existing person via this path instead of creating a new one.",
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
            "FUB event type. Only Registration, Seller Inquiry, Property Inquiry, General Inquiry, and Visited Open House trigger action plans/automations."
          ),
        source: z
          .string()
          .describe("Lead source name, e.g. 'Referral Exchange' or 'Speed to Lead'. Must match a source configured in Admin > Lead Flow for an action plan to auto-assign."),
        firstName: z.string().describe("Lead's first name."),
        lastName: z.string().optional().describe("Lead's last name."),
        email: z.string().email().optional().describe("Primary email address."),
        phone: z.string().optional().describe("Primary phone number."),
        tags: z.array(z.string()).optional().describe("Tags to apply to the person."),
        message: z.string().optional().describe("Free-text inquiry message/context for this event."),
        personId: z
          .number()
          .int()
          .optional()
          .describe("Existing person id - matches/updates that person instead of creating a new one."),
      },
    },
    async ({ type, source, firstName, lastName, email, phone, tags, message, personId }) => {
      try {
        const body = {
          type,
          source,
          ...(message && { message }),
          person: {
            ...(personId !== undefined && { id: personId }),
            firstName,
            ...(lastName && { lastName }),
            ...(email && { emails: [{ value: email }] }),
            ...(phone && { phones: [{ value: phone }] }),
            ...(tags && tags.length > 0 && { tags }),
          },
        };
        const data = await fub.post("/events", body);
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // update_lead - fix/update stage, tags, assignment, etc. on an existing person
  server.registerTool(
    "update_lead",
    {
      title: "Update Lead",
      description:
        "Update an existing Follow Up Boss person - stage, tags, assignment, price, or " +
        "background. Use this to correct a stage that didn't match an account's actual " +
        "pipeline (check list_pipeline_stages first), or to apply real tags after the fact " +
        "instead of only logging them in a note.",
      inputSchema: {
        personId: z.number().int().describe("The Follow Up Boss person id to update."),
        stage: z.string().optional().describe("Pipeline stage - must match a stage name from list_pipeline_stages."),
        tags: z.array(z.string()).optional().describe("Tags to apply."),
        mergeTags: z
          .boolean()
          .optional()
          .default(true)
          .describe("If true (default), tags are added to the person's existing tags. If false, tags REPLACE all existing tags."),
        assignedTo: z.string().optional().describe("Full name of the agent to reassign this person to."),
        price: z.number().optional().describe("Price (budget or list price) to set on the person record."),
        background: z.string().optional().describe("Replaces the background/notes field on the person record."),
        contacted: z
          .boolean()
          .optional()
          .describe("Marks the person as contacted. Note: setting this to true pauses any active Action Plans for them."),
      },
    },
    async ({ personId, stage, tags, mergeTags, assignedTo, price, background, contacted }) => {
      try {
        const body = {
          ...(stage && { stage }),
          ...(tags && tags.length > 0 && { tags }),
          ...(assignedTo && { assignedTo }),
          ...(price !== undefined && { price }),
          ...(background && { background }),
          ...(contacted !== undefined && { contacted }),
        };
        const query = tags && tags.length > 0 ? { mergeTags: mergeTags === false ? "false" : "true" } : undefined;
        const data = await fub.put(`/people/${personId}`, body, query);
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // list_pipeline_stages - look up an account's actual stage names before setting one
  server.registerTool(
    "list_pipeline_stages",
    {
      title: "List Pipeline Stages",
      description:
        "List the pipeline stages configured in this Follow Up Boss account (e.g. 'Lead', " +
        "'Hot', 'Under Contract'). Stage names are account-specific - check this before " +
        "passing a `stage` value to add_lead/update_lead/create_lead_event, since an " +
        "unrecognized name will silently fall back to a default stage instead of erroring.",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await fub.get("/stages");
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // list_custom_fields - discover custom field names before using customX fields
  server.registerTool(
    "list_custom_fields",
    {
      title: "List Custom Fields",
      description:
        "List the custom fields configured in this Follow Up Boss account (label, API name, " +
        "type, and choices for dropdowns). Note: add_lead/update_lead/create_lead_event don't " +
        "currently expose a generic custom-field parameter - use this to see what's configured " +
        "and confirm exact field names before that's added.",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await fub.get("/customFields");
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // get_priority_leads - one-call aggregation instead of list_leads + N*get_lead
  server.registerTool(
    "get_priority_leads",
    {
      title: "Get Priority Leads",
      description:
        "Pull a batch of leads (most-recently-updated first) along with each person's recent " +
        "notes, calls, texts, and emails, in a single call - instead of calling list_leads and " +
        "then get_lead once per person. Returns a compact bundle pre-sorted by most recent " +
        "activity across all of those sources. This tool does NOT itself judge motivation, " +
        "timeframe, or assign a Hot/Warm/Cool tier - that reading-comprehension step belongs " +
        "to the caller (see skills/fub-lead-scoring). Use tag_lead_priority afterwards to " +
        "persist the resulting tier back onto each person in FUB.",
      inputSchema: {
        stage: z.string().optional().describe("Restrict to one pipeline stage. Omit to scan across stages."),
        excludeStages: z
          .array(z.string())
          .optional()
          .describe(
            "Stage names to exclude, e.g. ['Closed', 'Trash', 'Not Interested'] - confirm exact names with list_pipeline_stages first."
          ),
        candidateLimit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(20)
          .describe(
            "How many most-recently-updated people to pull and enrich with activity (1-50). Higher = broader scan but more API calls and slower."
          ),
        activityLimitPerType: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .default(5)
          .describe("Max recent notes/calls/texts/emails to include per person, most recent first."),
      },
    },
    async ({ stage, excludeStages, candidateLimit, activityLimitPerType }) => {
      try {
        const listResp = await fub.get("/people", {
          stage,
          sort: "-updated",
          limit: candidateLimit,
          fields: "id,firstName,lastName,stage,source,tags,emails,phones,created,updated",
        });

        const excludeSet = new Set((excludeStages || []).map((s) => s.toLowerCase()));
        const candidates = (listResp.people || []).filter(
          (p) => !excludeSet.has((p.stage || "").toLowerCase())
        );

        const truncate = (text, max = 280) =>
          typeof text === "string" && text.length > max ? text.slice(0, max) + "…" : text;

        const enriched = await Promise.all(
          candidates.map(async (person) => {
            const [notes, calls, texts, emails] = await Promise.all([
              fub
                .get("/notes", { personId: person.id, limit: activityLimitPerType, sort: "-created" })
                .catch(() => ({ notes: [] })),
              fub
                .get("/calls", { personId: person.id, limit: activityLimitPerType, sort: "-created" })
                .catch(() => ({ calls: [] })),
              fub
                .get("/textMessages", { personId: person.id, limit: activityLimitPerType, sort: "-created" })
                .catch(() => ({ textMessages: [] })),
              fub
                .get("/emails", { personId: person.id, limit: activityLimitPerType, sort: "-created" })
                .catch(() => ({ emails: [] })),
            ]);

            const recentNotes = (notes.notes || []).map((n) => ({ created: n.created, body: truncate(n.body) }));
            const recentCalls = (calls.calls || []).map((c) => ({
              created: c.created,
              isIncoming: c.isIncoming,
              outcome: c.outcome,
              duration: c.duration,
            }));
            const recentTexts = (texts.textMessages || []).map((t) => ({
              created: t.created,
              isIncoming: t.isIncoming,
              message: truncate(t.message),
            }));
            const recentEmails = (emails.emails || []).map((e) => ({
              created: e.created,
              isIncoming: e.isIncoming,
              subject: e.subject,
            }));

            const allTimestamps = [
              person.updated,
              ...recentNotes.map((n) => n.created),
              ...recentCalls.map((c) => c.created),
              ...recentTexts.map((t) => t.created),
              ...recentEmails.map((e) => e.created),
            ].filter(Boolean);
            const lastActivityAt = allTimestamps.sort().at(-1) || person.updated;

            return {
              personId: person.id,
              name: [person.firstName, person.lastName].filter(Boolean).join(" "),
              stage: person.stage,
              source: person.source,
              tags: person.tags || [],
              createdAt: person.created,
              updatedAt: person.updated,
              lastActivityAt,
              recentNotes,
              recentCalls,
              recentTexts,
              recentEmails,
            };
          })
        );

        enriched.sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1));

        return textResult({ count: enriched.length, leads: enriched });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // tag_lead_priority - persist a Hot/Warm/Cool call back onto the person record
  server.registerTool(
    "tag_lead_priority",
    {
      title: "Tag Lead Priority",
      description:
        "Set or clear a lead's priority tag in FUB - 'Priority: Hot', 'Priority: Warm', or " +
        "'Priority: Cool' - replacing any existing priority tag on that person instead of " +
        "stacking duplicates. Pairs with get_priority_leads: compute the ranking there, then " +
        "persist it here so list_leads and FUB's own UI can filter by tag without recomputing " +
        "the score every time. Pass tier 'None' to remove the priority tag without setting a " +
        "new one (e.g. a lead that no longer qualifies).",
      inputSchema: {
        personId: z.number().int().describe("The Follow Up Boss person id."),
        tier: z.enum(["Hot", "Warm", "Cool", "None"]).describe("Priority tier to set. 'None' clears any existing priority tag."),
      },
    },
    async ({ personId, tier }) => {
      try {
        const person = await fub.get(`/people/${personId}`, { fields: "id,tags" });
        const existingTags = person.tags || [];
        const isPriorityTag = (t) => /^Priority: (Hot|Warm|Cool)$/i.test(t);
        const keptTags = existingTags.filter((t) => !isPriorityTag(t));
        const newTags = tier === "None" ? keptTags : [...keptTags, `Priority: ${tier}`];

        const data = await fub.put(`/people/${personId}`, { tags: newTags }, { mergeTags: "false" });
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

  // add_task - create a follow-up reminder tied to a person
  server.registerTool(
    "add_task",
    {
      title: "Add Task",
      description:
        "Create a follow-up task/reminder in Follow Up Boss, tied to a person. Use this so " +
        "follow-ups surface in FUB's own task list instead of only living in a chat response.",
      inputSchema: {
        personId: z.number().int().describe("The Follow Up Boss person id this task relates to."),
        name: z.string().describe("Short task title, e.g. 'Call new lead within 5 minutes'."),
        type: z
          .enum(["Follow Up", "Call", "Text", "Email", "Appointment", "Showing", "Closing", "Open House", "Thank You"])
          .optional()
          .describe("Task type."),
        dueDateTime: z
          .string()
          .optional()
          .describe("Due date/time with timezone offset, e.g. '2026-08-10T09:00:00-05:00'. Omit for no due time."),
        remindSecondsBefore: z
          .number()
          .int()
          .optional()
          .describe("Seconds before dueDateTime to remind. Requires dueDateTime."),
        assignedTo: z.string().optional().describe("Full name of the agent to assign this task to."),
      },
    },
    async ({ personId, name, type, dueDateTime, remindSecondsBefore, assignedTo }) => {
      try {
        const data = await fub.post("/tasks", {
          personId,
          ...(name && { name }),
          ...(type && { type }),
          ...(dueDateTime && { dueDateTime }),
          ...(remindSecondsBefore !== undefined && { remindSecondsBefore }),
          ...(assignedTo && { assignedTo }),
        });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // list_tasks - browse due/overdue/upcoming follow-ups
  server.registerTool(
    "list_tasks",
    {
      title: "List Tasks",
      description:
        "List Follow Up Boss tasks - use `due` to pull what's due today, overdue, or upcoming " +
        "across the whole pipeline, or `personId` to scope to one lead.",
      inputSchema: {
        personId: z.number().int().optional().describe("Scope to a single person's tasks."),
        isCompleted: z.boolean().optional().describe("Filter by completion status."),
        due: z.enum(["today", "overdue", "upcoming"]).optional().describe("Filter by due-date bucket."),
        type: z
          .enum(["Follow Up", "Call", "Text", "Email", "Appointment", "Showing", "Closing", "Open House", "Thank You"])
          .optional(),
        limit: z.number().int().min(1).max(100).optional().default(20),
      },
    },
    async ({ personId, isCompleted, due, type, limit }) => {
      try {
        const data = await fub.get("/tasks", { personId, isCompleted, due, type, limit });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // complete_task - mark a task done
  server.registerTool(
    "complete_task",
    {
      title: "Complete Task",
      description: "Mark a Follow Up Boss task as completed (or reopen it).",
      inputSchema: {
        taskId: z.number().int().describe("The Follow Up Boss task id."),
        isCompleted: z.boolean().optional().default(true),
      },
    },
    async ({ taskId, isCompleted }) => {
      try {
        const data = await fub.put(`/tasks/${taskId}`, { isCompleted });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // list_calls - browse logged calls, optionally across the whole pipeline (no personId)
  server.registerTool(
    "list_calls",
    {
      title: "List Calls",
      description:
        "List logged calls from Follow Up Boss. Omit personId to look across the whole " +
        "pipeline (e.g. to find recent unanswered calls) instead of one lead at a time.",
      inputSchema: {
        personId: z.number().int().optional().describe("Scope to a single person's calls."),
        phone: z.string().optional().describe("Filter by phone number (incoming or outgoing)."),
        limit: z.number().int().min(1).max(100).optional().default(20),
        offset: z.number().int().min(0).optional().default(0),
      },
    },
    async ({ personId, phone, limit, offset }) => {
      try {
        const data = await fub.get("/calls", { personId, phone, limit, offset });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // register_fub_webhook - wire up FUB to POST events at this server (for speed-to-lead)
  server.registerTool(
    "register_fub_webhook",
    {
      title: "Register FUB Webhook",
      description:
        "Register a webhook with Follow Up Boss so it POSTs events (e.g. new leads) to this " +
        "server's /webhooks/fub endpoint. Needed once, after this server is deployed at a " +
        "public HTTPS URL, to power the speed-to-lead auto-response flow. See " +
        "skills/speed-to-lead/SKILL.md.",
      inputSchema: {
        callbackUrl: z
          .string()
          .describe("This server's public webhook URL, e.g. 'https://your-app.up.railway.app/webhooks/fub'."),
        event: z
          .string()
          .optional()
          .default("peopleCreated")
          .describe("FUB event type to subscribe to. Defaults to 'peopleCreated' (new leads)."),
      },
    },
    async ({ callbackUrl, event }) => {
      try {
        const data = await fub.post("/webhooks", { event, url: callbackUrl });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // notify_slack - post a draft (email, social post, report) to a channel for human review
  server.registerTool(
    "notify_slack",
    {
      title: "Notify Slack",
      description:
        "Post a message - a drafted email, a batch of social posts, an agent report, a " +
        "follow-up list - to a configured Slack channel so a human can review it before " +
        "anything goes out. Requires SLACK_WEBHOOKS to be configured with a JSON map of " +
        "channel label to Slack Incoming Webhook URL. See skills/slack-review-queue for how " +
        "to set up channels like 'marketing-review' or 'cmo'.",
      inputSchema: {
        channel: z
          .string()
          .describe("Label of the configured Slack channel to post to, e.g. 'marketing-review'."),
        text: z.string().describe("The message to post. Plain text or Slack mrkdwn."),
      },
    },
    async ({ channel, text }) => {
      try {
        const data = await postToSlack({ channel, text });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}

const filterSchema = z
  .array(
    z.object({
      filter_id: z.string().describe("Filter id from dealmachine_filters, e.g. 'is_preforeclosure'."),
      operator: z
        .string()
        .describe("Operator allowed for this filter, e.g. 'is_boolean', 'contains_any', 'greater_than_or_equal', 'date_range'."),
      value: z.any().describe("The filter value - shape depends on the operator (boolean, number, array of option ids, or a {start,end} range object)."),
    })
  )
  .optional()
  .describe("Filter conditions, ANDed together. Call dealmachine_filters first to find valid filter_id/operator combinations.");

const locationSchema = z
  .array(
    z.object({
      type: z.enum(["state", "county", "city", "zip_code", "radius"]),
      code: z
        .string()
        .optional()
        .describe("For state: 2-letter code. For county: FIPS/county code. For city: numeric place id from dealmachine_location_search. For zip_code: 5-digit ZIP."),
      latitude: z.number().optional().describe("Center latitude, for type 'radius'."),
      longitude: z.number().optional().describe("Center longitude, for type 'radius'."),
      radius_miles: z.number().optional().describe("Radius in miles, for type 'radius'."),
    })
  )
  .describe("One or more location scopes. Get a city/county code from dealmachine_location_search first - don't guess one.");

/**
 * Registers DealMachine tools on the given McpServer instance. Talks to
 * DealMachine's own REST API directly (see src/dealMachineClient.js) rather
 * than through a session-level connector - see skills/dealmachine-prospecting
 * and skills/expired-fsbo-prospecting for the workflows these are meant to
 * power, including the compliance notes on contacting anyone these tools
 * surface.
 */
export function registerDealMachineTools(server) {
  // dealmachine_usage - account/plan/credit info, always free
  server.registerTool(
    "dealmachine_usage",
    {
      title: "DealMachine Usage",
      description:
        "Get the connected DealMachine account's org, plan, and credit info. Free - call this " +
        "before any large search or enrichment batch to confirm there's enough credit left, " +
        "not after hitting a failure.",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await dealMachine.get("/account");
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // dealmachine_location_search - resolve a place name to a location code, free
  server.registerTool(
    "dealmachine_location_search",
    {
      title: "DealMachine Location Search",
      description:
        "Resolve a city/county/state name to the location code dealmachine_property_search and " +
        "dealmachine_people_search need. Free. Always call this before guessing a location code.",
      inputSchema: {
        q: z.string().describe("Location name to match, e.g. 'San Jose' or 'Santa Clara'."),
        type: z.enum(["state", "county", "city", "zip_code"]).optional().describe("Restrict to one location type."),
        state: z.string().optional().describe("Optional 2-letter state code to narrow results."),
      },
    },
    async ({ q, type, state }) => {
      try {
        const data = await dealMachine.get("/locations/list", { q, type, state });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // dealmachine_filters - list valid filter_id/operator combos, free
  server.registerTool(
    "dealmachine_filters",
    {
      title: "DealMachine Filters",
      description:
        "List available search filters (id, allowed operators, option values for categorical " +
        "ones) for properties or people. Free. Call this before building a filters array for " +
        "dealmachine_property_search or dealmachine_people_search rather than guessing filter_ids.",
      inputSchema: {
        source_type: z.enum(["properties", "people"]).optional().default("properties"),
        search: z.string().optional().describe("Filter the list by name, e.g. 'condition' or 'equity'."),
      },
    },
    async ({ source_type, search }) => {
      try {
        const data = await dealMachine.get("/filters", { source_type, search });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // dealmachine_fields - list available data fields, free
  server.registerTool(
    "dealmachine_fields",
    {
      title: "DealMachine Fields",
      description:
        "List available data fields for properties or people, to pass in the `fields` array of " +
        "a search or enrichment call. Free.",
      inputSchema: {
        source_type: z.enum(["properties", "people"]).optional().default("properties"),
        search: z.string().optional().describe("Filter the list by name, e.g. 'condition' or 'equity'."),
      },
    },
    async ({ source_type, search }) => {
      try {
        const data = await dealMachine.get("/fields", { source_type, search });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // dealmachine_property_search - the main prospecting search
  server.registerTool(
    "dealmachine_property_search",
    {
      title: "DealMachine Property Search",
      description:
        "Search properties by location and filter criteria (condition, equity, absentee owner, " +
        "preforeclosure, etc. - see dealmachine_filters). Property-only data (contact_audience " +
        "'none') is cheap; requesting owner contacts spends people credits per match. Always " +
        "run a small per_page batch first and check dealmachine_usage before a big pull.",
      inputSchema: {
        locations: locationSchema,
        filters: filterSchema,
        fields: z.array(z.string()).optional().describe("Extra fields to include beyond the default set."),
        contact_audience: z
          .enum(["owners", "owners_and_family", "residents", "renters", "none"])
          .optional()
          .default("none")
          .describe("Which contacts to return with each property. 'none' returns property data only, at no contact-credit cost."),
        page: z.number().int().min(1).optional().default(1),
        per_page: z.number().int().min(1).max(100).optional().default(25),
        sort: z.string().optional().describe("Sort field, e.g. '-estimated_value'."),
      },
    },
    async ({ locations, filters, fields, contact_audience, page, per_page, sort }) => {
      try {
        const data = await dealMachine.post("/properties/search", {
          locations,
          filters,
          fields,
          contact_audience,
          page,
          per_page,
          sort,
        });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // dealmachine_property_get - single property detail, including owner contacts if requested
  server.registerTool(
    "dealmachine_property_get",
    {
      title: "DealMachine Property Detail",
      description:
        "Get full detail for a single property by its DealMachine property id (from " +
        "dealmachine_property_search). Requesting contact_audience other than 'none' spends " +
        "people credits for any owner contact found.",
      inputSchema: {
        id: z.string().describe("DealMachine property id, e.g. 'prop_12345'."),
        fields: z.array(z.string()).optional().describe("Extra fields to include beyond the default set."),
        contact_audience: z
          .enum(["owners", "owners_and_family", "residents", "renters", "none"])
          .optional()
          .default("none"),
      },
    },
    async ({ id, fields, contact_audience }) => {
      try {
        const data = await dealMachine.get(`/properties/${encodeURIComponent(id)}`, {
          fields: fields ? fields.join(",") : undefined,
          contact_audience,
        });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // dealmachine_property_count - count matches without paying for records
  server.registerTool(
    "dealmachine_property_count",
    {
      title: "DealMachine Property Count",
      description:
        "Count properties matching a location/filter combination without returning any " +
        "records - free. Use this to size a search before running dealmachine_property_search.",
      inputSchema: {
        locations: locationSchema,
        filters: filterSchema,
      },
    },
    async ({ locations, filters }) => {
      try {
        const data = await dealMachine.post("/properties/count", { locations, filters });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // dealmachine_people_search - search owners/contacts directly
  server.registerTool(
    "dealmachine_people_search",
    {
      title: "DealMachine People Search",
      description:
        "Search for people/contacts by location and filter criteria. Spends people credits per " +
        "match returned - run dealmachine_property_count-style sizing first where possible.",
      inputSchema: {
        locations: locationSchema,
        filters: filterSchema,
        fields: z.array(z.string()).optional(),
        anchor: z.enum(["person", "property"]).optional().default("person").describe("Whether results are grouped per person or per property."),
        page: z.number().int().min(1).optional().default(1),
        per_page: z.number().int().min(1).max(100).optional().default(25),
      },
    },
    async ({ locations, filters, fields, anchor, page, per_page }) => {
      try {
        const data = await dealMachine.post("/people/search", { locations, filters, fields, anchor, page, per_page });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // dealmachine_people_get - single person detail
  server.registerTool(
    "dealmachine_people_get",
    {
      title: "DealMachine Person Detail",
      description: "Get full detail for a single person by their DealMachine person id.",
      inputSchema: {
        id: z.string().describe("DealMachine person id, e.g. 'per_12345'."),
        fields: z.array(z.string()).optional(),
      },
    },
    async ({ id, fields }) => {
      try {
        const data = await dealMachine.get(`/people/${encodeURIComponent(id)}`, { fields: fields ? fields.join(",") : undefined });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // dealmachine_enrich_address - property + owner lookup by address
  server.registerTool(
    "dealmachine_enrich_address",
    {
      title: "DealMachine Enrich by Address",
      description: "Look up property and owner data for one or more street addresses. Spends credits per match.",
      inputSchema: {
        addresses: z.array(z.string()).describe("Full street addresses, e.g. '1200 Barton Springs Rd, Austin, TX 78704'."),
        fields: z.array(z.string()).optional(),
      },
    },
    async ({ addresses, fields }) => {
      try {
        const data = await dealMachine.post("/enrichment/address", {
          addresses: addresses.map((full_address) => ({ full_address })),
          fields,
        });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // dealmachine_enrich_apn - property lookup by assessor parcel number
  server.registerTool(
    "dealmachine_enrich_apn",
    {
      title: "DealMachine Enrich by APN",
      description: "Look up a property by Assessor Parcel Number (APN) and state. Spends credits per match.",
      inputSchema: {
        apn: z.string().describe("Assessor Parcel Number, e.g. '01-2345-0067'."),
        state: z.string().describe("2-letter state code."),
        fields: z.array(z.string()).optional(),
      },
    },
    async ({ apn, state, fields }) => {
      try {
        const data = await dealMachine.post("/enrichment/apn", { apns: [{ apn, state }], fields });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // dealmachine_enrich_name - person lookup by name
  server.registerTool(
    "dealmachine_enrich_name",
    {
      title: "DealMachine Enrich by Name",
      description:
        "Look up a person's contact info by name. Ambiguous names (common first+last combos) " +
        "can return several different real people - narrow with state when possible, and check " +
        "age/phone/address on the result before treating a match as certain rather than assuming " +
        "the first result is the right person.",
      inputSchema: {
        first_name: z.string().optional(),
        last_name: z.string().describe("Required."),
        state: z.string().optional().describe("2-letter state code, narrows results significantly."),
        fields: z.array(z.string()).optional(),
      },
    },
    async ({ first_name, last_name, state, fields }) => {
      try {
        const data = await dealMachine.post("/enrichment/name", {
          people: [{ first_name, last_name, state }],
          fields,
        });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // dealmachine_enrich_phone - reverse phone lookup
  server.registerTool(
    "dealmachine_enrich_phone",
    {
      title: "DealMachine Enrich by Phone",
      description: "Reverse-lookup a phone number to the person and any associated property. Spends credits per match.",
      inputSchema: {
        phone: z.string().describe("Phone number, digits only or formatted."),
        fields: z.array(z.string()).optional(),
      },
    },
    async ({ phone, fields }) => {
      try {
        const data = await dealMachine.post("/enrichment/phone", { phones: [{ phone }], fields });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // dealmachine_enrich_email - reverse email lookup
  server.registerTool(
    "dealmachine_enrich_email",
    {
      title: "DealMachine Enrich by Email",
      description: "Reverse-lookup an email address to the person and any associated property. Spends credits per match.",
      inputSchema: {
        email: z.string().describe("Email address."),
        fields: z.array(z.string()).optional(),
      },
    },
    async ({ email, fields }) => {
      try {
        const data = await dealMachine.post("/enrichment/email", { emails: [{ email }], fields });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // dealmachine_check_dnc - National Do Not Call registry check
  server.registerTool(
    "dealmachine_check_dnc",
    {
      title: "DealMachine DNC Check",
      description:
        "Check whether a phone number is on the National Do Not Call registry. Run this before " +
        "any call/text outreach to a number sourced from a search or enrichment call - " +
        "prospecting from public/skip-traced data does not imply consent to be called or texted.",
      inputSchema: {
        phone: z.string().describe("Phone number to check."),
      },
    },
    async ({ phone }) => {
      try {
        const data = await dealMachine.post("/dnc-check", { phones: [phone] });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // dealmachine_comps - comparable sales for a subject property
  server.registerTool(
    "dealmachine_comps",
    {
      title: "DealMachine Comps",
      description: "Find comparable recent sales for a subject property, for pricing/ARV conversations.",
      inputSchema: {
        property_id: z.string().describe("Subject property's DealMachine id, e.g. 'prop_12345'."),
        radius_miles: z.number().optional().describe("Search radius in miles. Defaults to a small radius around the subject property."),
        timeframe: z.enum(["3months", "6months", "12months", "24months"]).optional().default("6months"),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ property_id, radius_miles, timeframe, limit }) => {
      try {
        const data = await dealMachine.post("/comps", { property_id, radius_miles, timeframe, limit });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}
