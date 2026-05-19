import { pipedriveClient } from "./client";

// Idempotent upserts for Pipedrive Person + Organization. Re-running a
// submission for the same partner returns the same IDs — search before create.

export async function upsertPerson({
  name,
  email,
  orgId,
}: {
  name: string;
  email: string;
  orgId?: number;
}): Promise<number> {
  const existing = await pipedriveClient.searchPersons(email);
  if (existing.length > 0) {
    return existing[0].item.id;
  }
  const created = await pipedriveClient.createPerson({
    name,
    email: [{ value: email, primary: true }],
    org_id: orgId,
  });
  return created.id;
}

export async function upsertOrganization({ name }: { name: string }): Promise<number> {
  const existing = await pipedriveClient.searchOrganizations(name);
  if (existing.length > 0) {
    return existing[0].item.id;
  }
  const created = await pipedriveClient.createOrganization({ name });
  return created.id;
}
