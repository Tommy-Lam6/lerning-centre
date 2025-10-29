import { proxySchema } from "better-sqlite3-proxy";
import { db } from "./db2";

export type Enrollments = {
  course_id: number;
  student_id: number;
};

export type Courses = {
  id: number;
  teacher_id: number;
  teacher?: Teacher;
};

export type Teacher = {};

export type DBProxy = {
  courses: Courses[];
  enrollments: Enrollments[];
};

export let proxy = proxySchema<DBProxy>(db, {
  courses: ["id", ["teacher_id", { field: "id", table: "teacher" }]],
  enrollments: ["course_id", "student_id"],
});
