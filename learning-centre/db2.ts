import { createDB } from "better-sqlite3-schema";
import path from "path";

// 運行時 __dirname = dist/，所以用 .. 返回 learning-centre/
export let db = createDB({
  file: path.join(__dirname, "..", "database.sqlite"),
});
