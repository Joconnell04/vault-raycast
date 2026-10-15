import { Action, ActionPanel, Clipboard, Form, Icon, showHUD, showToast, Toast, useNavigation } from "@raycast/api";
import { useEffect, useState } from "react";
import { createSecret, guessService, guessType, Secret, SecretInput, TYPES, updateSecret } from "./notion";

const AUTO = "auto";

// Something copied from a dashboard: one token, no spaces, long enough to be a key.
function looksLikeSecret(text: string) {
  const t = text.trim();
  return (t.length >= 16 && !/\s/.test(t)) || /-----BEGIN [A-Z ]*KEY-----/.test(t);
}

export function SecretForm(props: { secret?: Secret; onSaved?: (s: Secret) => void; prefillClipboard?: boolean }) {
  const { secret, onSaved } = props;
  const { pop } = useNavigation();
  const [name, setName] = useState(secret?.name ?? "");
  const [value, setValue] = useState(secret?.value ?? "");
  const [type, setType] = useState<string>(secret?.type ?? AUTO);
  const [service, setService] = useState(secret?.service ?? "");
  const [notes, setNotes] = useState(secret?.notes ?? "");
  const [nameError, setNameError] = useState<string>();
  const [valueError, setValueError] = useState<string>();

  useEffect(() => {
    if (!props.prefillClipboard) return;
    Clipboard.readText().then((text) => {
      if (text && looksLikeSecret(text)) setValue((v) => v || text.trim());
    });
  }, []);

  const guessedType = guessType(name, value);
  const guessedService = guessService(name, value, type === AUTO ? guessedType : type);

  async function submit() {
    if (!name.trim()) return setNameError("Required");
    if (!value.trim()) return setValueError("Required");
    const input: SecretInput = { name, value: value.trim(), type: type === AUTO ? undefined : type, service, notes };
    const toast = await showToast({ style: Toast.Style.Animated, title: secret ? "Saving…" : "Adding to Vault…" });
    try {
      const saved = secret ? await updateSecret(secret.id, input) : await createSecret(input);
      toast.style = Toast.Style.Success;
      toast.title = secret ? "Saved" : "Added";
      toast.message = saved.name;
      onSaved?.(saved);
      if (secret || onSaved) pop();
      else await showHUD(`Added ${saved.name} to Vault`);
    } catch (e) {
      toast.style = Toast.Style.Failure;
      toast.title = "Notion error";
      toast.message = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <Form
      navigationTitle={secret ? `Edit ${secret.name}` : "Add Secret"}
      actions={
        <ActionPanel>
          <Action.SubmitForm title={secret ? "Save" : "Add to Vault"} icon={Icon.Lock} onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Name"
        placeholder="OpenAI API Key"
        value={name}
        error={nameError}
        onChange={(v) => {
          setName(v);
          setNameError(undefined);
        }}
        autoFocus
      />
      <Form.TextArea
        id="value"
        title="Value"
        placeholder="Paste the key"
        value={value}
        error={valueError}
        onChange={(v) => {
          setValue(v);
          setValueError(undefined);
        }}
      />
      <Form.Separator />
      <Form.Dropdown id="type" title="Type" value={type} onChange={setType}>
        <Form.Dropdown.Item value={AUTO} title={guessedType ? `Auto (${guessedType})` : "Auto"} icon={Icon.Wand} />
        {TYPES.map((t) => (
          <Form.Dropdown.Item key={t} value={t} title={t} />
        ))}
      </Form.Dropdown>
      <Form.TextField
        id="service"
        title="Service"
        placeholder={guessedService ?? "Optional"}
        value={service}
        onChange={setService}
      />
      <Form.TextArea id="notes" title="Notes" placeholder="Optional" value={notes} onChange={setNotes} />
    </Form>
  );
}
