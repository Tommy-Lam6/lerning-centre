const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 初始化数据库函数
function initializeDatabase() {
  const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'), (err) => {
    if (err) {
      console.error('打开数据库时出错:', err.message);
      return;
    }
    console.log('✅ 成功连接到 SQLite 数据库');
  });

  // 启用外键约束
  db.run('PRAGMA foreign_keys = ON');

  // 创建所有表
  db.serialize(() => {
    console.log('🗃️ 开始创建数据库表...');

    // 创建用户表
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student', 'teacher', 'admin')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) {
        console.error('❌ 创建用户表时出错:', err.message);
      } else {
        console.log('✅ 用户表已创建或已存在');
      }
    });

    // 创建课程表
    db.run(`CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      teacher_id INTEGER NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (teacher_id) REFERENCES users(id)
    )`, (err) => {
      if (err) {
        console.error('❌ 创建课程表时出错:', err.message);
      } else {
        console.log('✅ 课程表已创建或已存在');
      }
    });

    // 创建选课记录表
    db.run(`CREATE TABLE IF NOT EXISTS enrollments (
      course_id INTEGER,
      student_id INTEGER,
      enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (course_id, student_id),
      FOREIGN KEY (course_id) REFERENCES courses(id),
      FOREIGN KEY (student_id) REFERENCES users(id)
    )`, (err) => {
      if (err) {
        console.error('❌ 创建选课记录表时出错:', err.message);
      } else {
        console.log('✅ 选课记录表已创建或已存在');
      }
    });

    // 创建房间表
    db.run(`CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER UNIQUE,
      name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id)
    )`, (err) => {
      if (err) {
        console.error('❌ 创建房间表时出错:', err.message);
      } else {
        console.log('✅ 房间表已创建或已存在');
      }
    });

    // 创建教材表
    db.run(`CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER,
      title TEXT,
      url TEXT,
      type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES rooms(id)
    )`, (err) => {
      if (err) {
        console.error('❌ 创建教材表时出错:', err.message);
      } else {
        console.log('✅ 教材表已创建或已存在');
      }
    });

    // 创建消息表
    db.run(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER,
      user_id INTEGER,
      text TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES rooms(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`, (err) => {
      if (err) {
        console.error('❌ 创建消息表时出错:', err.message);
      } else {
        console.log('✅ 消息表已创建或已存在');
      }
    });

    // 创建作业表
    db.run(`CREATE TABLE IF NOT EXISTS homework (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER,
      title TEXT,
      description TEXT,
      deadline DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES rooms(id)
    )`, (err) => {
      if (err) {
        console.error('❌ 创建作业表时出错:', err.message);
      } else {
        console.log('✅ 作业表已创建或已存在');
      }
    });

    // 创建作业提交表
    db.run(`CREATE TABLE IF NOT EXISTS homework_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      homework_id INTEGER,
      student_id INTEGER,
      file_url TEXT,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      grade INTEGER,
      feedback TEXT,
      FOREIGN KEY (homework_id) REFERENCES homework(id),
      FOREIGN KEY (student_id) REFERENCES users(id)
    )`, (err) => {
      if (err) {
        console.error('❌ 创建作业提交表时出错:', err.message);
      } else {
        console.log('✅ 作业提交表已创建或已存在');
      }
    });

    // 插入测试数据
    console.log('\n👥 开始插入测试数据...');
    
    const users = [
      { username: 'user', password: '1234', role: 'student' },
      { username: 'teacher1', password: '1234', role: 'teacher' },
      { username: 'student1', password: '1234', role: 'student' },
      { username: 'admin1', password: '1234', role: 'admin' },
      { username: 'leung hoiki', password: '1234', role: 'student' }  // 添加 leung hoiki 學生
    ];

    const insertUserStmt = db.prepare("INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)");
    
    users.forEach(user => {
      insertUserStmt.run(user.username, user.password, user.role, (err) => {
        if (err) {
          console.error(`❌ 插入用户 ${user.username} 时出错:`, err.message);
        } else {
          console.log(`✅ 用户 ${user.username} 插入成功`);
        }
      });
    });
    
    insertUserStmt.finalize();

    // 插入测试课程和选课记录（在所有表创建完成后）
    setTimeout(() => {
      console.log('\n📚 创建测试课程和选课记录...');
      
      // 创建测试课程
      db.run(
        "INSERT OR IGNORE INTO courses (name, teacher_id, description) VALUES (?, ?, ?)",
        ['數學入門課程', 2, '基礎數學教學課程'],  // teacher1 的 ID 是 2
        function(err) {
          if (err) {
            console.error('❌ 创建测试课程时出错:', err.message);
          } else {
            const courseId = this.lastID;
            console.log(`✅ 测试课程创建成功，ID: ${courseId}`);
            
            // 为课程创建房间
            db.run(
              "INSERT OR IGNORE INTO rooms (course_id, name) VALUES (?, ?)",
              [courseId, '數學入門教室'],
              function(err) {
                if (err) {
                  console.error('❌ 创建房间时出错:', err.message);
                } else {
                  console.log(`✅ 房间创建成功，ID: ${this.lastID}`);
                  
                  // 插入选课记录 - leung hoiki 选课
                  db.run(
                    "INSERT OR IGNORE INTO enrollments (course_id, student_id) VALUES (?, ?)",
                    [courseId, 5],  // leung hoiki 的 ID 是 5
                    function(err) {
                      if (err) {
                        console.error('❌ 插入选课记录时出错:', err.message);
                      } else {
                        console.log(`✅ leung hoiki 选课成功`);
                        
                        // 也让学生1选课
                        db.run(
                          "INSERT OR IGNORE INTO enrollments (course_id, student_id) VALUES (?, ?)",
                          [courseId, 3],  // student1 的 ID 是 3
                          function(err) {
                            if (err) {
                              console.error('❌ student1 选课失败:', err.message);
                            } else {
                              console.log(`✅ student1 选课成功`);
                              
                              // 显示最终数据状态
                              showDatabaseStatus(db);
                            }
                          }
                        );
                      }
                    }
                  );
                }
              }
            );
          }
        }
      );
    }, 1000);
  });
}

// 显示数据库状态
function showDatabaseStatus(db) {
  console.log('\n📊 数据库最终状态:');
  
  // 查询用户
  db.all("SELECT id, username, role FROM users ORDER BY id", (err, users) => {
    if (err) {
      console.error('查询用户时出错:', err.message);
    } else {
      console.log('\n👥 用户列表:');
      console.log('ID\t用户名\t\t角色');
      console.log('------------------------');
      users.forEach(user => {
        console.log(`${user.id}\t${user.username}\t\t${user.role}`);
      });
    }
    
    // 查询课程
    db.all("SELECT id, name, teacher_id FROM courses", (err, courses) => {
      if (err) {
        console.error('查询课程时出错:', err.message);
      } else {
        console.log('\n📚 课程列表:');
        console.log('ID\t课程名称\t\t教师ID');
        console.log('--------------------------------');
        courses.forEach(course => {
          console.log(`${course.id}\t${course.name}\t\t${course.teacher_id}`);
        });
      }
      
      // 查询选课记录
      db.all(`
        SELECT e.course_id, c.name as course_name, e.student_id, u.username as student_name
        FROM enrollments e
        JOIN courses c ON e.course_id = c.id
        JOIN users u ON e.student_id = u.id
      `, (err, enrollments) => {
        if (err) {
          console.error('查询选课记录时出错:', err.message);
        } else {
          console.log('\n🎓 选课记录:');
          console.log('课程ID\t课程名称\t\t学生ID\t学生姓名');
          console.log('--------------------------------------------');
          enrollments.forEach(enroll => {
            console.log(`${enroll.course_id}\t${enroll.course_name}\t\t${enroll.student_id}\t${enroll.student_name}`);
          });
        }
        
        // 查询房间
        db.all("SELECT id, course_id, name FROM rooms", (err, rooms) => {
          if (err) {
            console.error('查询房间时出错:', err.message);
          } else {
            console.log('\n🏠 房间列表:');
            console.log('房间ID\t课程ID\t房间名称');
            console.log('----------------------------');
            rooms.forEach(room => {
              console.log(`${room.id}\t${room.course_id}\t${room.name}`);
            });
            
            console.log('\n✅ 数据库初始化完成！');
            console.log('🎯 现在可以测试学生管理功能了！');
            
            // 关闭数据库连接
            db.close((err) => {
              if (err) {
                console.error('关闭数据库时出错:', err.message);
              } else {
                console.log('\n🔒 数据库连接已关闭');
              }
            });
          }
        });
      });
    });
  });
}

// 运行初始化函数
initializeDatabase();