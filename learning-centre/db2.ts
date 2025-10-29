import { createDB } from "better-sqlite3-schema";

export let db = createDB({
  file: "database.sqlite",
});
