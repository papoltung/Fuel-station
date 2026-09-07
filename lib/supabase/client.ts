import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";

export function createClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error("ยังไม่ได้ตั้งค่า Supabase Auth");
  return createBrowserClient(config.url, config.publishableKey);
}
