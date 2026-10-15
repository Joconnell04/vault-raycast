import {
  Action,
  ActionPanel,
  Clipboard,
  Color,
  Form,
  Icon,
  List,
  popToRoot,
  showToast,
  Toast,
  useNavigation,
  Keyboard,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useEffect, useMemo, useState } from "react";
import { createSecret, guessService, guessType, listSecrets, mask } from "./notion";
import { Parsed, parseBulk } from "./parse-bulk";

type Row = Parsed & { key: number; skip: boolean };

function Rename(props: { row: Row; onSave: (name: string) => void }) {
  const { pop } = useNavigation();
  const [name, setName] = useState(props.row.name);
  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save"
            onSubmit={() => {
              props.onSave(name.trim() || props.row.name);
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Name" value={name} onChange={setName} autoFocus />
    </Form>
  );
}

function Preview(props: { text: string }) {
  const { push } = useNavigation();
  const { data: existing = [], isLoading } = useCachedPromise(listSecrets, [], { keepPreviousData: true });
  const [rows, setRows] = useState<Row[]>(() => parseBulk(props.text).map((p, key) => ({ ...p, key, skip: false })));

  const dupes = useMemo(() => {
    const values = new Set(existing.map((s) => s.value.trim()));
    const names = new Set(existing.map((s) => s.name.toLowerCase()));
    return new Set(rows.filter((r) => values.has(r.value) || names.has(r.name.toLowerCase())).map((r) => r.key));
  }, [existing, rows]);

  const toImport = rows.filter((r) => !r.skip && !dupes.has(r.key));
  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function importAll() {
    const toast = await showToast({ style: Toast.Style.Animated, title: `Adding ${toImport.length}…` });
    try {
      for (const [i, r] of toImport.entries()) {
        toast.message = `${i + 1}/${toImport.length} ${r.name}`;
        await createSecret({ name: r.name, value: r.value, notes: r.notes });
      }
      toast.style = Toast.Style.Success;
      toast.title = `Added ${toImport.length}`;
      toast.message = undefined;
      await popToRoot();
    } catch (e) {
      toast.style = Toast.Style.Failure;
      toast.title = "Notion error";
      toast.message = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <List isLoading={isLoading} navigationTitle={`${toImport.length} to add`} isShowingDetail>
      <List.EmptyView icon={Icon.MagnifyingGlass} title="No keys found in that text" />
      {rows.map((r) => {
        const dupe = dupes.has(r.key);
        const type = guessType(r.name, r.value);
        return (
          <List.Item
            key={r.key}
            title={r.name}
            icon={
              dupe
                ? { source: Icon.CheckCircle, tintColor: Color.SecondaryText }
                : r.skip
                  ? { source: Icon.Circle, tintColor: Color.SecondaryText }
                  : { source: Icon.PlusCircle, tintColor: Color.Green }
            }
            accessories={[{ text: dupe ? "In Vault" : r.skip ? "Skipped" : mask(r.value) }]}
            detail={
              <List.Item.Detail
                markdown={"```\n" + r.value + "\n```" + (r.notes ? `\n\n${r.notes}` : "")}
                metadata={
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.Label title="Type" text={type ?? "—"} />
                    <List.Item.Detail.Metadata.Label
                      title="Service"
                      text={guessService(r.name, r.value, type) ?? "—"}
                    />
                  </List.Item.Detail.Metadata>
                }
              />
            }
            actions={
              <ActionPanel>
                <Action title={`Add ${toImport.length} to Vault`} icon={Icon.Lock} onAction={importAll} />
                {!dupe && (
                  <Action
                    title={r.skip ? "Include" : "Skip"}
                    icon={r.skip ? Icon.PlusCircle : Icon.XMarkCircle}
                    shortcut={Keyboard.Shortcut.Common.Save}
                    onAction={() => update(r.key, { skip: !r.skip })}
                  />
                )}
                <Action
                  title="Rename"
                  icon={Icon.Pencil}
                  shortcut={Keyboard.Shortcut.Common.Edit}
                  onAction={() => push(<Rename row={r} onSave={(name) => update(r.key, { name })} />)}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}

export default function Command() {
  const { push } = useNavigation();
  const [text, setText] = useState("");

  useEffect(() => {
    Clipboard.readText().then((t) => t && setText((cur) => cur || t));
  }, []);

  return (
    <Form
      navigationTitle="Bulk Add"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Preview" icon={Icon.Eye} onSubmit={() => push(<Preview text={text} />)} />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="text"
        title="Pasted Text"
        placeholder="Copy a Keep search page or any list of keys, then paste here"
        value={text}
        onChange={setText}
      />
    </Form>
  );
}
