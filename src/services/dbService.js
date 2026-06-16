const { Pool } = require("pg");

// Диагностика: выводим начало URL, чтобы убедиться, что он вообще загрузился
if (!process.env.DATABASE_URL) {
  console.error("CRITICAL: DATABASE_URL is not set in environment variables!");
} else {
  console.log("DB Service: Connected to database.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false 
  }
});

module.exports = {
  query: (text, params) => {
  
    return pool.query(text, params).catch(err => {
      console.error("DB Query Error:", err.message, "SQL:", text);
      throw err;
    });
  },
};