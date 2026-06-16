// Подключаем твой настроенный пул
const pool = require("../config/db"); // ✅ Путь верный

const wordService = {
  // 1. Ищем тему в глобальном кэше уроков (используем твою таблицу lessons или аналогичный кэш)
  getWordsByTopic: async (topicName) => {
    try {
      // Ищем закэшированный текст урока по названию темы в колонке grammar или читай из кэш-таблицы, если она есть
      // Если у тебя для кэша создана отдельная таблица, например topic_words_cache, оставь её, но убедись, что она создана в Neon
      const res = await pool.query(
        "SELECT grammar FROM lessons WHERE reading = $1 LIMIT 1", 
        [topicName]
      );
      return res.rows[0] ? res.rows[0].grammar : null;
    } catch (err) {
      console.error("❌ Ошибка при поиске кэша темы в БД:", err.message);
      return null; // В случае ошибки БД даем боту сгенерировать через ИИ
    }
  },

  // 2. Сохраняем сгенерированный пак от Gemini в общий кэш уроков
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

  // 3. Массовое сохранение слов в личный профиль студента через транзакцию (СТРУКТУРИРОВАННО)
  saveUserVocabulary: async (userId, wordsArray) => {
    const client = await pool.connect(); // Берем один коннект из пула
    try {
      await client.query("BEGIN"); // Стартуем транзакцию для безопасности данных
      
      // Делаем INSERT именно в твою таблицу vocabulary и созданные колонки
      const insertQuery = `
        INSERT INTO vocabulary (telegram_id, word, translation, transcription) 
        VALUES ($1, $2, $3, $4)
      `;

      for (const item of wordsArray) {
        // Передаем userId и распарсенные экшеном поля объекта
        await client.query(insertQuery, [userId, item.word, item.translation, item.transcription]);
      }
      
      await client.query("COMMIT"); // Фиксируем изменения в Neon
    } catch (err) {
      await client.query("ROLLBACK"); // Если упало на каком-то слове — откатываем всё назад
      console.error("❌ Ошибка транзакции при сохранении слов юзера:", err.message);
      throw err;
    } finally {
      client.release(); // Обязательно возвращаем коннект обратно в пул!
    }
  },

  // 4. Вытаскиваем весь личный словарь конкретного пользователя для отображения
  getUserVocabulary: async (userId) => {
    try {
      const res = await pool.query(
        "SELECT word, translation, transcription FROM vocabulary WHERE telegram_id = $1 ORDER BY id ASC",
        [userId]
      );
      // Возвращаем массив объектов со словами
      return res.rows;
    } catch (err) {
      console.error("❌ Ошибка получения словаря пользователя из БД:", err.message);
      throw err;
    }
  }
};

module.exports = wordService;