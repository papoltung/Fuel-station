import { createClient } from "@libsql/client";
const db = createClient({ url: "file:./dev.db" });
db.execute("SELECT name FROM sqlite_master WHERE type='table'").then(r => {
  console.log(r.rows.map((x: any) => x.name).join("\n"));
  db.close();
});
