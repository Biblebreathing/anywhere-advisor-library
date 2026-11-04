import "server-only";

/** Minimal GoHighLevel (LeadConnector) API v2 client. Every call is a no-op when GHL_API_TOKEN is not set. */
const BASE = "https://services.leadconnectorhq.com";

async function ghl<T = unknown>(path: string, init: { method: string; body?: unknown }): Promise<T | null> {
  const token = process.env.GHL_API_TOKEN;
  if (!token) return null;
  const res = await fetch(BASE + path, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: "2021-07-28",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    console.error(`GHL ${init.method} ${path} failed: ${res.status} ${await res.text().catch(() => "")}`);
    return null;
  }
  return (await res.json().catch(() => null)) as T | null;
}

/** Finds or creates the contact for this email and returns its ID. */
export async function upsertContact(email: string, fields: { firstName?: string; lastName?: string } = {}) {
  const data = await ghl<{ contact?: { id: string } }>("/contacts/upsert", {
    method: "POST",
    body: { locationId: process.env.GHL_LOCATION_ID, email, ...fields },
  });
  return data?.contact?.id ?? null;
}

export async function addTags(contactId: string, tags: string[]) {
  if (!tags.length) return false;
  return (await ghl(`/contacts/${contactId}/tags`, { method: "POST", body: { tags } })) !== null;
}

export async function setCustomField(contactId: string, fieldId: string, value: string) {
  return (
    (await ghl(`/contacts/${contactId}`, {
      method: "PUT",
      body: { customFields: [{ id: fieldId, field_value: value }] },
    })) !== null
  );
}

/** Tag naming used across the library, e.g. aa-webinar-ch04-complete. */
export const tag = {
  owner: (slug: string) => `aa-${slug}-owner`,
  course: (slug: string) => `aa-${slug}-course`,
  accessGranted: "aa-library-access-granted",
};
