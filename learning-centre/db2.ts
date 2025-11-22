import { createDB } from "better-sqlite3-schema";
import path from "path";

export let db = createDB({
  file: path.join(__dirname, "..", "database.sqlite"),
});
