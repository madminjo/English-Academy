const db = require("../config/db"); // Твой рабочий конфиг БД

// Создание нового пользователя при старте (/start)
async function createUser(user) {
  await db.query(
    `
    INSERT INTO users (telegram_id, username, first_name)
    VALUES ($1, $2, $3)
    ON CONFLICT (telegram_id) DO NOTHING
    `,
    [user.id, user.username || null, user.first_name || null]
  );
}

// Получение пользователя по Telegram ID
async function getUser(id) {
  const result = await db.query(
    "SELECT * FROM users WHERE telegram_id = $1",
    [id]
  );
  return result.rows[0];
}

// Функция для рассылки: получаем всех пользователей
async function getAllUsers() {
  const result = await db.query("SELECT telegram_id, first_name, current_day FROM users");
  return result.rows;
}

// Обновляем текущий день/урок пользователя в PostgreSQL
async function updateUserDay(id, newDay) {
  await db.query(
    `
    UPDATE users 
    SET current_day = $1 
    WHERE telegram_id = $2
    `,
    [newDay, id]
  );
}

// 🔥 ДОБАВЛЕНО: Обновление глобального счётчика выученных слов юзера
async function updateWordsCount(id, count) {
  await db.query(
    `
    UPDATE users 
    SET words_learned = words_learned + $1 
    WHERE telegram_id = $2
    `,
    [count, id]
  );
}

// Экспортируем все функции, включая алиасы и новые фичи
module.exports = {
  createUser,
  getUser,
  getUserById: getUser, // Идеально мэтчится с вызовами в других модулях
  getAllUsers,
  updateUserDay,
  updateWordsCount // Теперь доступно для импорта!
};