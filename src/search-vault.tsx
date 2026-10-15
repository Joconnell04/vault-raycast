import {
  Action,
  ActionPanel,
  Alert,
  Clipboard,
  Color,
  confirmAlert,
  Icon,
  List,
  showHUD,
  showToast,
  Toast,
  Keyboard,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { deleteSecret, listSecrets, mask, Secret } from "./notion";
import { SecretForm } from "./secret-form";

const TYPE_COLORS: Record<string, Color> = {
  "API Key": Color.Blue,
  Token: Color.Purple,
  Password: Color.Orange,
  "Private Key": Color.Red,
  Personal: Color.Green,
  Payment: Color.Yellow,
  Other: Color.SecondaryText,
};

function fence(value: string) {
  return "```\n" + value.replace(/```/g, "ˋˋˋ") + "\n```";
}

export default function Command() {
  const { data = [], isLoading, mutate, revalidate } = useCachedPromise(listSecrets, [], { keepPreviousData: true });

  async function remove(secret: Secret) {
    const ok = await confirmAlert({
      title: `Delete ${secret.name}?`,
      message: "Moves it to Notion trash.",
      primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
    });
    if (!ok) return;
    const toast = await showToast({ style: Toast.Style.Animated, title: "Deleting…" });
    try {
      await mutate(deleteSecret(secret.id), {
        optimisticUpdate: (list) => (list ?? []).filter((s) => s.id !== secret.id),
      });
      toast.style = Toast.Style.Success;
      toast.title = "Deleted";
      toast.message = secret.name;
    } catch (e) {
      toast.style = Toast.Style.Failure;
      toast.title = "Notion error";
      toast.message = e instanceof Error ? e.message : String(e);
    }
  }

  function saved(updated: Secret) {
    mutate(Promise.resolve(), {
      optimisticUpdate: (list) => (list ?? []).map((s) => (s.id === updated.id ? updated : s)),
      shouldRevalidateAfter: false,
    });
  }

  function added(created: Secret) {
    mutate(Promise.resolve(), {
      optimisticUpdate: (list) => [created, ...(list ?? [])],
      shouldRevalidateAfter: false,
    });
  }

  return (
    <List isLoading={isLoading} isShowingDetail={data.length > 0} searchBarPlaceholder="Search secrets">
      <List.EmptyView
        icon={Icon.Lock}
        title={isLoading ? "Loading Vault" : "Nothing here"}
        actions={
          <ActionPanel>
            <Action.Push title="Add Secret" icon={Icon.Plus} target={<SecretForm onSaved={added} />} />
          </ActionPanel>
        }
      />
      {data.map((s) => (
        <List.Item
          key={s.id}
          title={s.name}
          subtitle={s.service}
          keywords={[s.service ?? "", s.type ?? "", s.notes ?? ""].filter(Boolean)}
          icon={{ source: Icon.Key, tintColor: TYPE_COLORS[s.type ?? "Other"] }}
          detail={
            <List.Item.Detail
              markdown={fence(s.value || " ")}
              metadata={
                <List.Item.Detail.Metadata>
                  <List.Item.Detail.Metadata.Label title="Masked" text={mask(s.value)} />
                  {s.type && (
                    <List.Item.Detail.Metadata.TagList title="Type">
                      <List.Item.Detail.Metadata.TagList.Item text={s.type} color={TYPE_COLORS[s.type]} />
                    </List.Item.Detail.Metadata.TagList>
                  )}
                  {s.service && <List.Item.Detail.Metadata.Label title="Service" text={s.service} />}
                  {s.notes && <List.Item.Detail.Metadata.Label title="Notes" text={s.notes} />}
                  <List.Item.Detail.Metadata.Label title="Updated" text={new Date(s.updated).toLocaleDateString()} />
                </List.Item.Detail.Metadata>
              }
            />
          }
          actions={
            <ActionPanel>
              <ActionPanel.Section>
                <Action
                  title="Copy Value"
                  icon={Icon.Clipboard}
                  onAction={async () => {
                    await Clipboard.copy(s.value, { concealed: true });
                    await showHUD(`Copied ${s.name}`);
                  }}
                />
                <Action
                  title="Paste Value"
                  icon={Icon.Text}
                  shortcut={{ modifiers: ["cmd"], key: "return" }}
                  onAction={() => Clipboard.paste(s.value)}
                />
                <Action.CopyToClipboard
                  title="Copy Name"
                  content={s.name}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "n" }}
                />
              </ActionPanel.Section>
              <ActionPanel.Section>
                <Action.Push
                  title="Edit"
                  icon={Icon.Pencil}
                  shortcut={Keyboard.Shortcut.Common.Edit}
                  target={<SecretForm secret={s} onSaved={saved} />}
                />
                <Action.Push
                  title="Add Secret"
                  icon={Icon.Plus}
                  shortcut={Keyboard.Shortcut.Common.New}
                  target={<SecretForm onSaved={added} />}
                />
                <Action.OpenInBrowser title="Open in Notion" url={s.url} shortcut={Keyboard.Shortcut.Common.Open} />
                <Action
                  title="Refresh"
                  icon={Icon.ArrowClockwise}
                  shortcut={Keyboard.Shortcut.Common.Refresh}
                  onAction={revalidate}
                />
              </ActionPanel.Section>
              <ActionPanel.Section>
                <Action
                  title="Delete"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  shortcut={{ modifiers: ["ctrl"], key: "x" }}
                  onAction={() => remove(s)}
                />
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
