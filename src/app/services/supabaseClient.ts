import { createClient } from "@supabase/supabase-js";
import { projectId, publicAnonKey } from "/utils/supabase/info";

const supabaseUrl = `https://${projectId}.supabase.co`;

// Singleton Supabase client for the frontend
export const supabase = createClient(supabaseUrl, publicAnonKey);

// Base URL for our edge function server
export const serverUrl = `${supabaseUrl}/functions/v1/make-server-31dd8e3b`;
