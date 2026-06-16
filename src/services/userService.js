const db = require("../config/db"); // Твой рабочий конфиг БД

// 1. Создание нового пользователя при старте
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

// 2. Получение пользователя
async function getUser(id) {
  const result = await db.query("SELECT * FROM users WHERE telegram_id = $1", [id]);
  return result.rows[0];
}

// 3. Получение всех (для рассылок)
async function getAllUsers() {
  const result = await db.query("SELECT telegram_id, first_name, current_day FROM users");
  return result.rows;
}

// 4. Обновление дня обучения
async function updateUserDay(id, newDay) {
  await db.query("UPDATE users SET current_day = $1 WHERE telegram_id = $2", [newDay, id]);
}

// 5. Счетчик слов
async function updateWordsCount(id, count) {
  await db.query("UPDATE users SET words_learned = words_learned + $1 WHERE telegram_id = $2", [count, id]);
}

// 6. 🔥 Установка подписки (mo1, mo3, mo6, mo12)
async function setSubscription(id, status) {
  const now = new Date();
  let endDate = new Date();

  if (status === 'mo1') endDate.setMonth(now.getMonth() + 1);
  else if (status === 'mo3') endDate.setMonth(now.getMonth() + 3);
  else if (status === 'mo6') endDate.setMonth(now.getMonth() + 6);
  else if (status === 'mo12') endDate.setFullYear(now.getFullYear() + 1);
  else endDate = null; // для 'free'

  await db.query(
    `UPDATE users SET status = $1, sub_end_date = $2 WHERE telegram_id = $3`,
    [status, endDate, id]
  );
}

// 7. 🔥 Проверка статуса (автоматически скидывает в 'free', если время вышло)
async function isSubActive(id) {
  const user = await getUser(id);
  if (!user || user.status === 'free') return false;
  
  if (user.sub_end_date && new Date() > new Date(user.sub_end_date)) {
    await db.query(`UPDATE users SET status = 'free', sub_end_date = NULL WHERE telegram_id = $1`, [id]);
    return false;
  }
  return true;
}

module.exports = {
  createUser,
  getUser,
  getUserById: getUser,
  getAllUsers,
  updateUserDay,
  updateWordsCount,
  setSubscription,
  isSubActive
};