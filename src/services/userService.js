const db = require('../config/db') // Твой рабочий конфиг БД

const ADMIN_ID = 5037778442

// Гарантируем наличие всех нужных колонок при старте (без миграций руками)
async function ensureSchema() {
	const columns = [
		{ name: 'daily_requests', ddl: 'INTEGER DEFAULT 0' },
		{ name: 'last_request_date', ddl: 'DATE' },
		{ name: 'daily_lessons', ddl: 'INTEGER DEFAULT 0' },
		{ name: 'last_lesson_date', ddl: 'DATE' },
		{ name: 'last_opened_lesson_day', ddl: 'INTEGER' }, // какой урок (day_number) открывали последним
	]

	for (const col of columns) {
		try {
			await db.query(
				`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col.name} ${col.ddl}`,
			)
		} catch (error) {
			console.error(`⚠️ Не удалось проверить/создать колонку ${col.name}:`, error.message)
		}
	}
	console.log('✅ Схема users проверена (лимиты ИИ и уроков)')
}

// 1. Создание нового пользователя при старте
async function createUser(user) {
	await db.query(
		`
    INSERT INTO users (telegram_id, username, first_name, created_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (telegram_id) DO NOTHING
    `,
		[user.id, user.username || null, user.first_name || null],
	)
}

// 2. Получение пользователя
async function getUser(id) {
	const result = await db.query('SELECT * FROM users WHERE telegram_id = $1', [
		id,
	])
	return result.rows[0]
}

// 3. Получение всех (для рассылок)
async function getAllUsers() {
	const result = await db.query(
		'SELECT telegram_id as id, username, status FROM users WHERE telegram_id IS NOT NULL',
	)
	return result.rows
}

// Получение пользователей с фильтром по статусу подписки
async function getUsersByStatus(filter) {
	let query
	if (filter === 'free') {
		query = `SELECT telegram_id as id, username, status FROM users WHERE telegram_id IS NOT NULL AND status = 'free'`
	} else if (filter === 'subscribed') {
		query = `SELECT telegram_id as id, username, status FROM users WHERE telegram_id IS NOT NULL AND status != 'free'`
	} else {
		query = `SELECT telegram_id as id, username, status FROM users WHERE telegram_id IS NOT NULL`
	}
	const result = await db.query(query)
	return result.rows
}

// 4. Обновление дня обучения
async function updateUserDay(id, newDay) {
	await db.query('UPDATE users SET current_day = $1 WHERE telegram_id = $2', [
		newDay,
		id,
	])
}

// 5. Счетчик слов
async function updateWordsCount(id, count) {
	await db.query(
		'UPDATE users SET words_learned = words_learned + $1 WHERE telegram_id = $2',
		[count, id],
	)
}

// 6. 🔥 Установка подписки (mo1, mo3, mo6, mo12)
async function setSubscription(id, status) {
	const now = new Date()
	let endDate = new Date()

	if (status === 'mo1') endDate.setMonth(now.getMonth() + 1)
	else if (status === 'mo3') endDate.setMonth(now.getMonth() + 3)
	else if (status === 'mo6') endDate.setMonth(now.getMonth() + 6)
	else if (status === 'mo12') endDate.setFullYear(now.getFullYear() + 1)
	else endDate = null // для 'free'

	await db.query(
		`UPDATE users SET status = $1, sub_end_date = $2 WHERE telegram_id = $3`,
		[status, endDate, id],
	)
}

async function revokeSubscription(id) {
	await db.query(
		"UPDATE users SET status = 'free', sub_end_date = NULL WHERE telegram_id = $1",
		[id],
	)
}

// Принудительная выдача подписки (на произвольный срок)
async function grantSubscription(id, status, days = 30) {
	const endDate = new Date()
	endDate.setDate(endDate.getDate() + days)

	await db.query(
		'UPDATE users SET status = $1, sub_end_date = $2 WHERE telegram_id = $3',
		[status, endDate, id],
	)
}

// 7. 🔥 Проверка статуса (автоматически скидывает в 'free', если время вышло)
async function isSubActive(id) {
	await db.query(
		`
    UPDATE users 
    SET status = 'free', sub_end_date = NULL 
    WHERE telegram_id = $1 
    AND status != 'free' 
    AND sub_end_date IS NOT NULL 
    AND sub_end_date < NOW()
  `,
		[id],
	)

	const user = await getUser(id)
	return user && user.status !== 'free'
}

// Сколько дней прошло с регистрации
function daysSinceRegistration(user) {
	const regDate = new Date(user.created_at)
	const now = new Date()
	return Math.floor((now - regDate) / (1000 * 60 * 60 * 24))
}

// Является ли юзер привилегированным (админ или активная подписка)
function isPrivileged(id, user) {
	return id === ADMIN_ID || (user && user.status !== 'free')
}

// ===================== ЛИМИТ ЗАПРОСОВ К ИИ =====================

async function canRequest(id) {
	const user = await getUser(id)
	if (!user) return false
	if (isPrivileged(id, user)) return true

	const dailyLimit = 3

	const today = new Date().toISOString().split('T')[0]
	const lastRequestDate = user.last_request_date
		? new Date(user.last_request_date).toISOString().split('T')[0]
		: null

	if (lastRequestDate !== today) return true // Новый день — счетчик ещё не считается
	return user.daily_requests < dailyLimit
}

async function incrementRequests(id) {
	const today = new Date().toISOString().split('T')[0]
	const result = await db.query(
		`
    UPDATE users 
    SET daily_requests = CASE WHEN last_request_date::date = $1::date THEN daily_requests + 1 ELSE 1 END,
        last_request_date = $1 
    WHERE telegram_id = $2
    RETURNING daily_requests`,
		[today, id],
	)

	return result.rows[0] ? result.rows[0].daily_requests : null
}

// ===================== ЛИМИТ ОТКРЫТИЯ УРОКОВ =====================
// Триал (дни 0-5): 5 уроков/день. После: 2 урока/день.

// Старая версия (оставлена для обратной совместимости, если используется где-то ещё)
async function canOpenLesson(id) {
	const user = await getUser(id)
	if (!user) return false
	if (isPrivileged(id, user)) return true

	const dailyLimit = daysSinceRegistration(user) <= 5 ? 5 : 2

	const today = new Date().toISOString().split('T')[0]
	const lastLessonDate = user.last_lesson_date
		? new Date(user.last_lesson_date).toISOString().split('T')[0]
		: null

	if (lastLessonDate !== today) return true
	return user.daily_lessons < dailyLimit
}

// Новая версия: учитывает повторное открытие ТОГО ЖЕ урока в тот же день (бесплатно)
// Возвращает { allowed: bool, alreadyOpenedToday: bool }
async function checkLessonAccess(id, dayNumber) {
	const user = await getUser(id)
	if (!user) return { allowed: false, alreadyOpenedToday: false }
	if (isPrivileged(id, user)) return { allowed: true, alreadyOpenedToday: false }

	const today = new Date().toISOString().split('T')[0]
	const lastLessonDate = user.last_lesson_date
		? new Date(user.last_lesson_date).toISOString().split('T')[0]
		: null

	if (lastLessonDate === today && user.last_opened_lesson_day === dayNumber) {
		return { allowed: true, alreadyOpenedToday: true }
	}

	const dailyLimit = daysSinceRegistration(user) <= 5 ? 5 : 2

	if (lastLessonDate !== today) {
		return { allowed: true, alreadyOpenedToday: false }
	}

	return { allowed: user.daily_lessons < dailyLimit, alreadyOpenedToday: false }
}
// Старая версия increment (оставлена для обратной совместимости)
async function incrementLessonsLegacy(id) {
	const today = new Date().toISOString().split('T')[0]
	const result = await db.query(
		`
    UPDATE users 
    SET daily_lessons = CASE WHEN last_lesson_date::date = $1::date THEN daily_lessons + 1 ELSE 1 END,
        last_lesson_date = $1 
    WHERE telegram_id = $2
    RETURNING daily_lessons`,
		[today, id],
	)

	return result.rows[0] ? result.rows[0].daily_lessons : null
}

// Новая версия increment: тоже запоминает, какой урок открыли (для checkLessonAccess)
async function incrementLessons(id, dayNumber) {
	const today = new Date().toISOString().split('T')[0]
	const result = await db.query(
		`
    UPDATE users 
    SET daily_lessons = CASE WHEN last_lesson_date::date = $1::date THEN daily_lessons + 1 ELSE 1 END,
        last_lesson_date = $1,
        last_opened_lesson_day = $3
    WHERE telegram_id = $2
    RETURNING daily_lessons`,
		[today, id, dayNumber],
	)

	return result.rows[0] ? result.rows[0].daily_lessons : null
}

async function updateUserLanguage(id, lang) {
	try {
		await db.query('UPDATE users SET lang = $1 WHERE telegram_id = $2', [
			lang,
			id,
		])
	} catch (error) {
		if (error.code === '42703') {
			console.log("⚠️ Колонка 'lang' не найдена, создаю...")
			await db.query(
				"ALTER TABLE users ADD COLUMN IF NOT EXISTS lang VARCHAR(2) DEFAULT 'en'",
			)
			await db.query('UPDATE users SET lang = $1 WHERE telegram_id = $2', [
				lang,
				id,
			])
		} else {
			throw error
		}
	}
}

async function getUserLanguage(id) {
	const user = await getUser(id)
	return user ? user.lang : 'en'
}

module.exports = {
	ensureSchema,
	createUser,
	getUser,
	getUserById: getUser,
	getAllUsers,
	getUsersByStatus,
	updateUserDay,
	updateWordsCount,
	setSubscription,
	revokeSubscription,
	grantSubscription,
	isSubActive,
	canRequest,
	incrementRequests,
	canOpenLesson, // оставлена для совместимости
	checkLessonAccess, // новая, используем в today.js
	incrementLessons, // теперь принимает (id, dayNumber)
	updateUserLanguage,
	getUserLanguage,
}