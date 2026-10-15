// Turns pasted text (e.g. a Google Keep search page copied with ⌘A ⌘C) into secrets.
// A "value" line is one long token with no spaces, or a whole -----BEGIN … KEY----- block.
// The nearest title line ("… API Key", "… Token") names it; a plain label line such as an
// email or "Proxies:" names a sub-group; runs of bare values are numbered #1, #2, …

export type Parsed = { name: string; value: string; notes: string };
type Entry = Parsed & { base: string; seq: number };

const CHROME = new Set([
  "keep",
  "notes",
  "reminders",
  "edit labels",
  "archive",
  "trash",
  "open-source licenses",
  "collaborators",
  "remove them",
  "cancel",
  "save",
]);

export function isValueLine(line: string) {
  const t = line.trim();
  if (t.length < 16 || /\s/.test(t)) return false;
  if (/^https?:\/\//.test(t) || /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(t)) return false;
  return /\d/.test(t) && /[a-z]/i.test(t);
}

const isTitle = (line: string) => /\b(api|key|token|secret|password)\b/i.test(line) && !/^-----/.test(line);
const isChrome = (line: string) => CHROME.has(line.toLowerCase()) || /^\d+ search results?$/i.test(line);
const label = (line: string) => line.replace(/:\s*$/, "").trim();

export function parseBulk(text: string): Parsed[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !isChrome(l));
  const out: Entry[] = [];
  let buffer: string[] = [];
  let title = "";

  const addNotes = (entry: Entry | undefined, notes: string[]) => {
    if (!entry || !notes.length) return;
    entry.notes = [entry.notes, ...notes].filter(Boolean).join("\n");
  };

  const push = (value: string) => {
    const prev = out[out.length - 1];
    const t = buffer.findIndex(isTitle);
    if (t >= 0) {
      addNotes(prev, buffer.slice(0, t));
      title = label(buffer[t]);
      out.push({ name: title, base: title, seq: 1, value, notes: buffer.slice(t + 1).join("\n") });
    } else if (buffer.length) {
      const base = title ? `${title} (${label(buffer[0])})` : label(buffer[0]);
      out.push({ name: base, base, seq: 1, value, notes: buffer.slice(1).join("\n") });
    } else if (prev) {
      // A run of bare values under the same heading: number them.
      if (prev.seq === 1 && prev.name === prev.base) prev.name = `${prev.base} #1`;
      out.push({ name: `${prev.base} #${prev.seq + 1}`, base: prev.base, seq: prev.seq + 1, value, notes: "" });
    } else {
      out.push({ name: "Untitled", base: "Untitled", seq: 1, value, notes: "" });
    }
    buffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^-----BEGIN [A-Z ]*KEY-----/.test(line)) {
      const block = [line];
      while (i + 1 < lines.length && !/^-----END [A-Z ]*KEY-----/.test(block[block.length - 1])) block.push(lines[++i]);
      push(block.join("\n"));
    } else if (isValueLine(line)) {
      push(line);
    } else {
      buffer.push(line);
    }
  }
  addNotes(out[out.length - 1], buffer);
  return out.map(({ name, value, notes }) => ({ name, value, notes }));
}
