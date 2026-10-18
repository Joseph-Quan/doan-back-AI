const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  console.log('🔄 Đang kết nối tới MySQL Server để khởi tạo CSDL woodhome...');
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true
    });

    const sqlPath = path.join(__dirname, '../../database.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('⏳ Đang thực thi tệp database.sql...');
    await conn.query(sql);

    console.log('✅ Khởi tạo CSDL woodhome thành công với đầy đủ bảng và dữ liệu mẫu!');
    await conn.end();
  } catch (err) {
    console.error('❌ Không thể chạy migration:', err.message);
    console.log('💡 Lưu ý: Hãy đảm bảo MySQL Server (XAMPP/MySQL service) đã được bật trước khi chạy npm run init-db.');
  }
}

runMigration();
