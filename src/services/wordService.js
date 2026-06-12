// Подключаем твой настроенный пул
const pool = require("../config/db"); // ✅ Правильный путь

const wordService = {
  // Ищем тему в глобальном кэше (чтобы экономить лимиты ИИ и выдавать мгновенно)
  getWordsByTopic: async (topicName) => {
    try {
      const res = await pool.query(
        "SELECT raw_text FROM topic_words_cache WHERE topic_name = $1", 
        [topicName]
      );
      return res.rows[0] ? res.rows[0].raw_text : null;
    } catch (err) {
      console.error("❌ Ошибка при поиске кэша темы в БД:", err.message);
      return null; // В случае ошибки БД даем боту сгенерировать через ИИ
    }
  },

  // Сохраняем сгенерированный пак от Gemini в общий кэш
  saveWordsToCache: async (topicName, rawText) => {
    try {
      await pool.query(
        "INSERT INTO topic_words_cache (topic_name, raw_text) VALUES ($1, $2) ON CONFLICT (topic_name) DO NOTHING",
        [topicName, rawText]
      );
    } catch (err) {
      console.error("❌ Ошибка записи темы в кэш БД:", err.message);
    }
  },

  // Массовое сохранение слов в личный профиль студента через транзакцию
  saveUserVocabulary: async (userId, wordsArray) => {
    const client = await pool.connect(); // Берем один коннект из твоего пула max: 10
    try {
      await client.query("BEGIN"); // Стартуем транзакцию для безопасности данных
      
      const insertQuery = `
        INSERT INTO user_vocabulary (user_id, word_line) 
        VALUES ($1, $2) 
        ON CONFLICT (user_id, word_line) DO NOTHING
      `;

      for (const word of wordsArray) {
        await client.query(insertQuery, [userId, word]);
      }
      
      await client.query("COMMIT"); // Фиксируем изменения
    } catch (err) {
      await client.query("ROLLBACK"); // Если упало на каком-то слове — откатываем всё
      console.error("❌ Ошибка транзакции при сохранении слов юзера:", err.message);
      throw err;
    } finally {
      client.release(); // Обязательно возвращаем коннект обратно в пул Neon!
    }
  },

  // Вытаскиваем весь личный словарь конкретного пользователя
  getUserVocabulary: async (userId) => {
    try {
      const res = await pool.query(
        "SELECT word_line FROM user_vocabulary WHERE user_id = $1 ORDER BY id ASC",
        [userId]
      );
      return res.rows.map(row => row.word_line);
    } catch (err) {
      console.error("❌ Ошибка получения словаря пользователя из БД:", err.message);
      throw err;
    }
  }
};

module.exports = wordService;