import { Client } from "@notionhq/client";
import { getPreferenceValues } from "@raycast/api";

export const TYPES = ["API Key", "Token", "Password", "Private Key", "Personal", "Payment", "Other"] as const;
export type SecretType = (typeof TYPES)[number];

export type Secret = {
  id: string;
  url: string;
  name: string;
  value: string;
  type?: SecretType;
  service?: string;
  notes?: string;
  updated: string;
};

export type SecretInput = {
  name: string;
  value: string;
  type?: string;
  service?: string;
  notes?: string;
};

type Prefs = { notionToken: string; databaseId: string };

export function prefs() {
  return getPreferenceValues<Prefs>();
}

export function client() {
  return new Client({ auth: prefs().notionToken.trim() });
}

// Notion caps each rich text object at 2000 characters, so long keys are split.
function richText(text: string) {
  const chunks = text.match(/[\s\S]{1,2000}/g) ?? [];
  return chunks.map((content) => ({ type: "text" as const, text: { content } }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function plain(prop: any): string {
  const parts = prop?.title ?? prop?.rich_text ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return parts.map((p: any) => p.plain_text).join("");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toSecret(page: any): Secret {
  const p = page.properties;
  return {
    id: page.id,
    url: page.url,
    name: plain(p.Name),
    value: plain(p.Value),
    type: p.Type?.select?.name,
    service: plain(p.Service) || undefined,
    notes: plain(p.Notes) || undefined,
    updated: page.last_edited_time,
  };
}

function toProperties(input: SecretInput) {
  const type = input.type || guessType(input.name, input.value);
  const service = input.service?.trim() || guessService(input.name, input.value, type);
  return {
    Name: { title: richText(input.name.trim()) },
    Value: { rich_text: richText(input.value) },
    Type: { select: type ? { name: type } : null },
    Service: { rich_text: richText(service ?? "") },
    Notes: { rich_text: richText(input.notes?.trim() ?? "") },
  };
}

export async function listSecrets(): Promise<Secret[]> {
  const notion = client();
  const out: Secret[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion.databases.query({
      database_id: prefs().databaseId,
      start_cursor: cursor,
      page_size: 100,
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
    });
    out.push(...res.results.map(toSecret));
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return out;
}

export async function createSecret(input: SecretInput) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties = toProperties(input) as any;
  const page = await client().pages.create({ parent: { database_id: prefs().databaseId }, properties });
  return toSecret(page);
}

export async function updateSecret(id: string, input: SecretInput) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties = toProperties(input) as any;
  const page = await client().pages.update({ page_id: id, properties });
  return toSecret(page);
}

// Archived pages go to Notion's trash, so a delete can be undone there.
export async function deleteSecret(id: string) {
  await client().pages.update({ page_id: id, archived: true });
}

const PREFIX_SERVICES: [RegExp, string][] = [
  [/^sk-ant-/, "Anthropic"],
  [/^sk-proj-/, "OpenAI"],
  [/^AIza/, "Google"],
  [/^(github_pat_|ghp_|gho_)/, "GitHub"],
  [/^(ntn_|secret_)/, "Notion"],
  [/^cfat_/, "Cloudflare"],
  [/^sb_(publishable|secret)_/, "Supabase"],
  [/^xox[abp]-/, "Slack"],
  [/^(sk|pk|rk)_(live|test)_/, "Stripe"],
  [/^hf_/, "Hugging Face"],
  [/^r8_/, "Replicate"],
  [/^gsk_/, "Groq"],
  [/^re_/, "Resend"],
  [/^pplx-/, "Perplexity"],
];

export function guessType(name: string, value: string): SecretType | undefined {
  const n = name.toLowerCase();
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value) || n.includes("private key")) return "Private Key";
  if (/card|cvv|billing/.test(n)) return "Payment";
  if (/password|passcode|\bpin\b/.test(n) || /password:/i.test(value)) return "Password";
  if (/token|secret/.test(n)) return "Token";
  if (/\bapi\b|key/.test(n) || PREFIX_SERVICES.some(([re]) => re.test(value.trim()))) return "API Key";
  return undefined;
}

const NOISE =
  /\b(api|key|keys|token|secret|private|public|personal access|internal integration|http|password|project for|project)\b/gi;

export function guessService(name: string, value: string, type?: string): string | undefined {
  if (type === "Personal" || type === "Payment") return undefined;
  const fromValue = PREFIX_SERVICES.find(([re]) => re.test(value.trim()))?.[1];
  if (fromValue) return fromValue;
  const cleaned = name
    .replace(NOISE, " ")
    .replace(/[-–—]+.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}

export function mask(value: string) {
  const v = value.replace(/\s+/g, " ").trim();
  if (!v) return "";
  if (v.length <= 8) return "••••••";
  return `${v.slice(0, 6)}••••${v.slice(-3)}`;
}
