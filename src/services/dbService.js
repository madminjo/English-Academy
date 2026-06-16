const { Pool } = require("pg");

// Создаем пул подключений к PostgreSQL (Neon автоматически подтянет URL из .env)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    // Этот параметр обязателен для безопасного подключения к облачной базе Neon
    rejectUnauthorized: false 
  }
});

module.exports = {
  /**
   * Универсальный метод для выполнения SQL-запросов к базе данных
   */
  query: (text, params) => pool.query(text, params),
};