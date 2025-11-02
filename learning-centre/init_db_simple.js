const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'database.sqlite'));

// Enable foreign keys
db.pragma('foreign_keys = ON');

console.log('🗃️ 開始創建資料庫表...\n');

// Create users table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student', 'teacher', 'admin')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log('✅ users 表已建立');

// Create courses table
db.exec(`
  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    teacher_id INTEGER NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES users(id)
  )
`);
console.log('✅ courses 表已建立');

// Create enrollments table
db.exec(`
  CREATE TABLE IF NOT EXISTS enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, student_id),
    FOREIGN KEY (course_id) REFERENCES courses(id),
    FOREIGN KEY (student_id) REFERENCES users(id)
  )
`);
console.log('✅ enrollments 表已建立');

// Create rooms table
db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER UNIQUE NOT NULL,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id)
  )
`);
console.log('✅ rooms 表已建立');

// Create materials table
db.exec(`
  CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER,
    title TEXT,
    url TEXT,
    type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id)
  )
`);
console.log('✅ materials 表已建立');

// Create messages table
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER,
    user_id INTEGER,
    text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);
console.log('✅ messages 表已建立');

// Create homework table
db.exec(`
  CREATE TABLE IF NOT EXISTS homework (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER,
    title TEXT,
    description TEXT,
    deadline DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id)
  )
`);
console.log('✅ homework 表已建立');

// Create homework_submissions table
db.exec(`
  CREATE TABLE IF NOT EXISTS homework_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    homework_id INTEGER,
    student_id INTEGER,
    file_url TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    grade INTEGER,
    feedback TEXT,
    FOREIGN KEY (homework_id) REFERENCES homework(id),
    FOREIGN KEY (student_id) REFERENCES users(id)
  )
`);
console.log('✅ homework_submissions 表已建立');

// Create zoom_meetings table
db.exec(`
  CREATE TABLE IF NOT EXISTS zoom_meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id TEXT UNIQUE,
    title TEXT NOT NULL,
    start_time TEXT NOT NULL,
    duration INTEGER DEFAULT 60,
    join_url TEXT,
    password TEXT,
    teacher_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES users(id),
    FOREIGN KEY (course_id) REFERENCES courses(id)
  )
`);
console.log('✅ zoom_meetings 表已建立');

console.log('\n👥 開始插入測試數據...\n');

// Insert test users
const userStmt = db.prepare('INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)');
const users = [
  // 原有用戶
  ['user', '1234', 'student'],
  ['teacher1', '1234', 'teacher'],
  ['student1', '1234', 'student'],
  ['admin1', '1234', 'admin'],
  
  // 新增預設用戶
  ['to yin ling', '1234', 'teacher'],
  ['chan wing yan', '1234', 'student'],
  ['leung man yee', '1234', 'teacher'],
  ['wong wai ha', '1234', 'teacher'],
  ['leung hoi ki', '1234', 'student'],
  ['lee man', '1234', 'student'],
  ['lui mo hei', '1234', 'student'],
  ['poon mei yee', '1234', 'teacher'],
  ['chan tai man', '1234', 'student'],
  ['cheung hiu yi', '1234', 'teacher'],
  ['yim sze wing', '1234', 'student'],
  ['ho man chun', '1234', 'student'],
  ['lam wai ling', '1234', 'teacher']
];

users.forEach(([username, password, role]) => {
  userStmt.run(username, password, role);
  console.log(`✅ 用戶 ${username} 已插入`);
});

// Insert test course
const courseStmt = db.prepare('INSERT INTO courses (name, teacher_id, description) VALUES (?, ?, ?)');
const courseResult = courseStmt.run('數學入門課程', 2, '基礎數學教學課程');
const courseId = courseResult.lastInsertRowid;
console.log(`✅ 課程已建立，ID: ${courseId}`);
console.log(`✅ 課程已建立，ID: ${courseId}`);

// Insert room
const roomStmt = db.prepare('INSERT INTO rooms (course_id, name) VALUES (?, ?)');
const roomResult = roomStmt.run(courseId, '數學入門教室');
console.log(`✅ 房間已建立，ID: ${roomResult.lastID}`);

// Insert enrollments
const enrollStmt = db.prepare('INSERT OR IGNORE INTO enrollments (course_id, student_id) VALUES (?, ?)');
enrollStmt.run(courseId, 5); // leung hoiki
enrollStmt.run(courseId, 3); // student1
console.log(`✅ 選課記錄已建立`);

console.log('\n📊 資料庫最終狀態:\n');

// Display final state
const allUsers = db.prepare('SELECT id, username, role FROM users ORDER BY id').all();
console.log('👥 用戶列表:');
console.log('ID\t用戶名\t\t角色');
console.log('------------------------');
allUsers.forEach(user => {
  console.log(`${user.id}\t${user.username}\t\t${user.role}`);
});

const allCourses = db.prepare('SELECT id, name, teacher_id FROM courses').all();
console.log('\n📚 課程列表:');
console.log('ID\t課程名稱\t\t教師ID');
console.log('--------------------------------');
allCourses.forEach(course => {
  console.log(`${course.id}\t${course.name}\t\t${course.teacher_id}`);
});

const allEnrollments = db.prepare(`
  SELECT e.course_id, c.name as course_name, e.student_id, u.username as student_name
  FROM enrollments e
  JOIN courses c ON e.course_id = c.id
  JOIN users u ON e.student_id = u.id
`).all();
console.log('\n🎓 選課記錄:');
console.log('課程ID\t課程名稱\t\t學生ID\t學生姓名');
console.log('--------------------------------------------');
allEnrollments.forEach(enroll => {
  console.log(`${enroll.course_id}\t${enroll.course_name}\t\t${enroll.student_id}\t${enroll.student_name}`);
});

const allRooms = db.prepare('SELECT id, course_id, name FROM rooms').all();
console.log('\n🏠 房間列表:');
console.log('房間ID\t課程ID\t房間名稱');
console.log('----------------------------');
allRooms.forEach(room => {
  console.log(`${room.id}\t${room.course_id}\t${room.name}`);
});

console.log('\n✅ 資料庫初始化完成！');

db.close();
