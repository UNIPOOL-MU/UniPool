import { getToken } from "@/src/api/client";

const PEOPLE_BASE = process.env.EXPO_PUBLIC_UNIPOOL_PEOPLE_API || "https://jwodrevycbzlcukkoaps.supabase.co/functions/v1/unipool-people";

async function peopleRequest(path: string, options: RequestInit = {}) {
  const token = await getToken();
  const response = await fetch(`${PEOPLE_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const error: any = new Error(data?.detail || response.statusText || `Request failed (${response.status})`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export type PeopleTrust = {
  count: number;
  punctuality?: number | null;
  coordination?: number | null;
  behaviour?: number | null;
  overall?: number | null;
};

export type DirectoryPerson = {
  user_id: string;
  name?: string;
  email?: string;
  username?: string;
  picture?: string | null;
  school_name?: string | null;
  branch_name?: string | null;
  batch_year?: number | null;
  college_verified?: boolean;
  saved?: boolean;
  trust?: PeopleTrust;
};

export type CampusHome = {
  saved_people: number;
  trusted_contacts: number;
  unread_notifications: number;
  total_xp: number;
  level: number;
  circles: number;
  saved_routes: number;
  month: string;
  income_paise: number;
  expense_paise: number;
  net_cashflow_paise: number;
  events?: any[];
};

export type PeopleNotification = {
  id: string;
  user_id?: string;
  type?: string;
  title: string;
  body: string;
  route?: string | null;
  metadata?: Record<string, any> | null;
  read_at?: string | null;
  created_at: string;
};

export const peopleApi = {
  tourStatus: () => peopleRequest("/onboarding"),
  completeTour: () => peopleRequest("/onboarding", { method: "POST" }),
  profile: (userId: string) => peopleRequest(`/profiles/${encodeURIComponent(userId)}`),
  health: async () => {
    const response = await fetch(`${PEOPLE_BASE}/health`, { cache: "no-store" });
    return response.ok ? response.json() : null;
  },
  search: (q: string) => peopleRequest(`/search?q=${encodeURIComponent(q)}`) as Promise<DirectoryPerson[]>,
  saved: () => peopleRequest("/saved") as Promise<DirectoryPerson[]>,
  savePerson: (userId: string) => peopleRequest(`/saved/${encodeURIComponent(userId)}`, { method: "POST" }),
  unsavePerson: (userId: string) => peopleRequest(`/saved/${encodeURIComponent(userId)}`, { method: "DELETE" }),
  trustedContacts: () => peopleRequest("/trusted-contacts"),
  addTrustedContact: (body: { name: string; email?: string; phone?: string }) => peopleRequest("/trusted-contacts", { method: "POST", body: JSON.stringify(body) }),
  deleteTrustedContact: (id: string) => peopleRequest(`/trusted-contacts/${encodeURIComponent(id)}`, { method: "DELETE" }),
  notifications: (limit = 80, type?: string) => peopleRequest(`/notifications?limit=${Math.min(100, Math.max(1, limit))}${type ? `&type=${encodeURIComponent(type)}` : ""}`) as Promise<PeopleNotification[]>,
  readNotification: (id: string) => peopleRequest(`/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" }),
  readAllNotifications: () => peopleRequest("/notifications/read-all", { method: "POST" }),
  campusEvents: () => peopleRequest("/campus-events"),
  rsvpCampusEvent: (id: string, status: "going" | "interested") => peopleRequest(`/campus-events/${encodeURIComponent(id)}/rsvp`, { method: "POST", body: JSON.stringify({ status }) }),
  clearCampusEventRsvp: (id: string) => peopleRequest(`/campus-events/${encodeURIComponent(id)}/rsvp`, { method: "DELETE" }),
  campusHome: () => peopleRequest("/campus-home") as Promise<CampusHome>,
};

export { PEOPLE_BASE };
