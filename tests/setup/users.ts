import { randomBytes, randomUUID } from "node:crypto";
import { admin, anon } from "./db";

// Utenti di test creati con la service role (il signup pubblico è disattivato).
// Password casuali generate a ogni run: non stanno in nessun file.

export type TestUser = { id: string; email: string; password: string };

export async function createUser({ isAdmin }: { isAdmin: boolean }): Promise<TestUser> {
  const email = `test-${randomUUID()}@example.test`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  if (isAdmin) {
    const r = await admin.from("app_admins").insert({ user_id: data.user.id });
    if (r.error) throw new Error(`app_admins: ${r.error.message}`);
  }
  return { id: data.user.id, email, password };
}

export async function signedInClient(user: TestUser) {
  const client = anon();
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) throw new Error(`signIn: ${error.message}`);
  return client;
}

export async function deleteUser(user: TestUser | undefined) {
  if (user) await admin.auth.admin.deleteUser(user.id);
}
