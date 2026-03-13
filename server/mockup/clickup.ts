/**
 * ClickUp task creation for mockup leads.
 * Creates a follow-up task when a new mockup request is generated.
 */

interface ClickUpTaskOptions {
  teamName: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  sport: string;
  mockupRequestId: string;
  designCount: number;
}

export async function createClickUpTask(opts: ClickUpTaskOptions): Promise<string | null> {
  const apiKey = process.env.CLICKUP_API_KEY;
  const listId = process.env.CLICKUP_MOCKUP_LIST_ID;

  if (!apiKey || !listId) {
    console.log(`[ClickUp] Credentials not configured — would create task for ${opts.teamName}`);
    return null;
  }

  const baseUrl = process.env.BASE_URL || "https://sidelinenz.com";

  try {
    const response = await fetch(
      `https://api.clickup.com/api/v2/list/${listId}/task`,
      {
        method: "POST",
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: `Mockup Follow-up: ${opts.teamName} (${opts.sport})`,
          description: [
            `**New Mockup Lead**`,
            ``,
            `**Team:** ${opts.teamName}`,
            `**Contact:** ${opts.contactName}`,
            `**Email:** ${opts.contactEmail}`,
            opts.contactPhone ? `**Phone:** ${opts.contactPhone}` : null,
            `**Sport:** ${opts.sport}`,
            `**Designs Generated:** ${opts.designCount}`,
            ``,
            `**Admin View:** ${baseUrl}/admin/mockups/${opts.mockupRequestId}`,
            ``,
            `Mockup designs have been sent to the customer. Follow up within 24 hours.`,
          ].filter(Boolean).join("\n"),
          priority: 2, // High
          tags: ["mockup-lead", opts.sport],
          due_date: Date.now() + 24 * 60 * 60 * 1000, // Due in 24 hours
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[ClickUp] Error creating task: ${errText}`);
      return null;
    }

    const data = await response.json();
    console.log(`[ClickUp] Created task ${data.id} for ${opts.teamName}`);
    return data.id;
  } catch (err) {
    console.error("[ClickUp] Error:", err);
    return null;
  }
}
