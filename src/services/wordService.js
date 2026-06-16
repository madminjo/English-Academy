const pool = require("../config/db");

const wordService = {
  getWordsByTopic: async (topicName) => {
    try {
      const res = await pool.query(
        "SELECT grammar FROM lessons WHERE reading = $1 LIMIT 1", 
        [topicName]
      );
      return res.rows[0] ? res.rows[0].grammar : null;
    } catch (err) {
      console.error("❌ Ошибка при поиске кэша темы в БД:", err.message);
      return null;
    }
  },

  saveWordsToCache: async (topicName, rawText) => {
    try {
      await pool.query(
        "INSERT INTO lessons (grammar, reading) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [rawText, topicName]
      );
    } catch (err) {
      console.error("❌ Ошибка записи темы в кэш БД:", err.message);
    }
  },

  saveUserVocabulary: async (userId, wordsArray) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const insertQuery = `
        INSERT INTO vocabulary (telegram_id, word, translation, transcription) 
        VALUES ($1, $2, $3, $4)
      `;
      for (const item of wordsArray) {
        await client.query(insertQuery, [userId, item.word, item.translation, item.transcription]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("❌ Ошибка транзакции:", err.message);
      throw err;
    } finally {
      client.release();
    }
  },

  getUserVocabulary: async (userId) => {
    try {
      const res = await pool.query(
        "SELECT word, translation, transcription FROM vocabulary WHERE telegram_id = $1 ORDER BY id ASC",
        [userId]
      );
      return res.rows;
    } catch (err) {
      console.error("❌ Ошибка получения словаря:", err.message);
      throw err;
    }
  },

  clearUserVocabulary: async (telegramId) => {
    await pool.query("DELETE FROM vocabulary WHERE telegram_id = $1", [telegramId]);
  }
};

module.exports = wordService;