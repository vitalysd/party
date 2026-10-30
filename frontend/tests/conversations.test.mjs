import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
const bundle = await build({
  entryPoints: ["src/utils/conversations.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const { conversationRows } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
const room = (id, date) => ({
  id,
  name: id,
  is_direct: false,
  members: [],
  created_at: date,
});
test("mobile list contains every room and orders conversations by newest message", () => {
  const rows = conversationRows(
    [room("one", "2026-01-01"), room("two", "2026-01-02")],
    [],
    { one: [{ created_at: "2026-01-03", content: "new", sender_id: "me" }] },
    "me",
  );
  assert.deepEqual(
    rows.map((row) => row.channel.id),
    ["one", "two"],
  );
  assert.equal(rows[0].preview, "Вы: new");
});
test("DM titles use member identity and current profile rather than matching names", () => {
  const channel = {
    ...room("dm", "2026-01-01"),
    is_direct: true,
    members: [
      { user_id: "me" },
      { user_id: "friend", user: { id: "friend", display_name: "Old" } },
    ],
    unread_count: 3,
  };
  const [row] = conversationRows(
    [channel],
    [{ id: "friend", display_name: "New" }],
    {
      dm: [
        {
          created_at: "2026-01-02",
          sender_id: "friend",
          content: "",
          attachments: [{ filename: "image.png" }],
        },
      ],
    },
    "me",
  );
  assert.equal(row.title, "New");
  assert.equal(row.preview, "Вложение");
  assert.equal(row.unread, 3);
});
