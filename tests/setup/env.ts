import { inject } from "vitest";

// Rende disponibili ai moduli dell'app le stesse env che avrebbero su Vercel.
const sb = inject("supabase");
process.env.NEXT_PUBLIC_SUPABASE_URL = sb.url;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = sb.anonKey;
process.env.SUPABASE_SERVICE_ROLE_KEY = sb.serviceRoleKey;
process.env.SUBMIT_SALT ??= "test-salt-0123456789abcdef0123456789abcdef";
process.env.NEXT_PUBLIC_SITE_URL ??= "http://localhost:3000";
