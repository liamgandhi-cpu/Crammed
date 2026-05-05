import { query } from "../config/db";

export type Provider = "studentvue" | "schoology" | "ion";

export interface ConnectedAccount {
  id: string;
  user_id: string;
  provider: Provider;
  district_url: string | null;
  encrypted_credentials: string;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function upsertConnectedAccount(
  userId: string,
  provider: Provider,
  encryptedCredentials: string,
  districtUrl?: string | null
): Promise<ConnectedAccount> {
  const result = await query(
    `INSERT INTO connected_accounts (user_id, provider, district_url, encrypted_credentials)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, provider)
     DO UPDATE SET
       encrypted_credentials = EXCLUDED.encrypted_credentials,
       district_url          = EXCLUDED.district_url,
       updated_at            = now()
     RETURNING *`,
    [userId, provider, districtUrl ?? null, encryptedCredentials]
  );
  return result.rows[0] as ConnectedAccount;
}

export async function touchLastSynced(id: string): Promise<void> {
  await query(
    "UPDATE connected_accounts SET last_synced_at = now() WHERE id = $1",
    [id]
  );
}

export async function getConnectedAccounts(
  userId: string
): Promise<ConnectedAccount[]> {
  const result = await query(
    "SELECT * FROM connected_accounts WHERE user_id = $1 ORDER BY created_at",
    [userId]
  );
  return result.rows as ConnectedAccount[];
}

export async function getConnectedAccount(
  id: string,
  userId: string
): Promise<ConnectedAccount | null> {
  const result = await query(
    "SELECT * FROM connected_accounts WHERE id = $1 AND user_id = $2",
    [id, userId]
  );
  return (result.rows[0] as ConnectedAccount) ?? null;
}

export async function deleteConnectedAccount(
  id: string,
  userId: string
): Promise<boolean> {
  const result = await query(
    "DELETE FROM connected_accounts WHERE id = $1 AND user_id = $2",
    [id, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function clearItemsBySource(
  userId: string,
  source: string
): Promise<void> {
  await query(
    "DELETE FROM schedule_items WHERE user_id = $1 AND source = $2",
    [userId, source]
  );
}
