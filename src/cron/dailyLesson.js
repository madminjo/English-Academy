const cron = require('node-cron')
const { getAllUsers } = require('../services/userService')
const { Markup } = require('telegraf')
const topics = require('../data/topics')
// 🔥 ПОДКЛЮЧАЕМ НАШ СЕРВИС С ПУЛОМ АККАУНТОВ И ПОВТОРАМИ
const { generateContentWithRetry } = require('../services/aiService')

// Вспомогательная функция для безопасной отправки длинных сообщений (HTML) в рассылке
async function sendLongMessageToUser(bot, telegramId, text, keyboard = null) {
	const LIMIT = 4000
	if (text.length <= LIMIT) {
		return bot.telegram.sendMessage(telegramId, text, {
			parse_mode: 'HTML',
			reply_markup: keyboard?.reply_markup,
		})
	}

	const lines = text.split('\n')
	let currentChunk = ''

	for (const line of lines) {
		if ((currentChunk + line).length > LIMIT) {
			await bot.telegram.sendMessage(telegramId, currentChunk, {
				parse_mode: 'HTML',
			})
			currentChunk = ''
		}
		currentChunk += line + '\n'
	}

	if (currentChunk.trim().length > 0) {
		return bot.telegram.sendMessage(telegramId, currentChunk, {
			parse_mode: 'HTML',
			reply_markup: keyboard?.reply_markup,
		})
	}
}

module.exports = bot => {
	// 🔥 ЗАЩИТА ОТ ДУБЛИРОВАНИЯ: Уничтожаем старые запущенные задачи крона в памяти перед стартом
	const currentTasks = cron.getTasks()
	if (currentTasks.length > 0) {
		console.log(
			'♻️ [Cron] Найдено ' +
				currentTasks.length +
				' старых задач. Очищаем планировщик...',
		)
		currentTasks.forEach(task => task.stop())
	}

	// 🌍 ЕДИНЫЙ ЕЖЕЧАСНЫЙ КРОН ДЛЯ ВСЕГО МИРА (Запуск в 00 минут каждого часа)
	cron.schedule('0 * * * *', async () => {
		console.log(
			'⏰ [Cron] Запуск ежечасной проверки локального времени пользователей...',
		)

		let users = await fetchUsersSafely()
		if (!users) return

		const now = new Date()

		for (const user of users) {
			let userHour = -1 // Локальная переменная для отслеживания часа в рамках итерации

			try {
				// 1. Извлекаем таймзону пользователя из БД (если нет — ставим дефолт Бишкек)
				const userTz = user.timezone || 'Asia/Bishkek'
				const userLang = user.lang || 'en' // Получаем язык из БД (убедись, что поле lang есть у пользователя)
				const topicName =
					userLang === 'de'
						? require('../data/german_topics').getTopicById(
								user.current_day || 1,
							)
						: topics.getTopicById(user.current_day || 1)

				// 2. Вычисляем, какой СЕЙЧАС час у этого конкретного юзера (формат от 0 до 23)
				userHour = parseInt(
					new Intl.DateTimeFormat('en-US', {
						timeZone: userTz,
						hour: 'numeric',
						hourCycle: 'h23',
					}).format(now),
					10,
				)

				// ☀️ СРАБОТАЛ БУДИЛЬНИК: 07:00 УТРА (Уникальный ИИ-Урок)
				if (userHour === 7) {
					const currentDay = user.current_day || 1
					const topicName = topics.getTopicById(currentDay)
					const userName = user.first_name || 'студент'

					const isGerman = userLang === 'de'
					const persona = isGerman
						? "Ты — Майкл, харизматичный преподаватель немецкого языка, живущий в Берлине. Вайб: 'Alles klar?', 'Easy peasy!'."
						: "Ты — Майкл, харизматичный преподаватель американского английского, живущий в Лос-Анджелесе. Вайб: 'Hey bro!', 'Rise and shine, buddy!'."

					const context = isGerman
						? 'Берлине и крутой столичной жизни'
						: 'Лос-Анджелесе, калифорнийском солнце и серфинге'

					const prompt = `
            ${persona}
            Ты виртуозно владеешь русским языком и используешь его, чтобы создавать живые, понятные утренние уроки.
            Сгенерируй для студента по имени ${userName} сочный, интересный утренний урок.
            
            Текущий день обучения: ${currentDay}
            Официальная тема из плана: ${topicName}
            
            Структура ответа, которую ты должен сгенерировать (пиши сплошным HTML текстом):
            1. ☀️ Бодрое приветствие на английском в твоем фирменном американском стиле ("Hey bro!", "Rise and shine, buddy!") и теплое напутствие на русском языке.
            2. 🎯 Название темы: Напиши крупно, что сегодня вы изучаете тему "${topicName}".
            3. 📖 Теория на русском: Объясни эту тему максимально просто, «на пальцах», без занудных терминов, как для 10-летнего ребёнка. Расскажи, в чем фишка этого правила и когда его применять в реальной жизни.
            4. 💡 Примеры: Напиши 3-4 живых примера предложений на английском с переводом на русский. Английские фразы обязательно выделяй тегом <code>.
            5. 📝 Домашнее задание: Придумай на русском языке 2-3 простых и веселых упражнения (например, перевести фразу или составить предложение), чтобы студент закрепил тему "${topicName}".
            
            ⚠️ СТРОЖАЙШИЕ ПРАВИЛА ФОРМАТИРОВАНИЯ ДЛЯ TELEGRAM HTML:
            - Используй ТОЛЬКО три тега: <b> для жирного текста, <i> для курсива и <code> для моноширинного.
            - Никаких маркдаун-звездочек (**)! Вместо них для жирности используй только тег <b>.
            - Категорически ЗАПРЕЩЕНО использовать теги заголовков (<h1>, <h2>, <h3>), списков (<ul>, <li>) или абзацев (<p>). Разделяй блоки просто переносом строки.
            - Если используешь знаки "<" или ">", заменяй их на &lt; и &gt;, чтобы парсер Telegram не выдавал ошибку.
          `

					// Вызываем наш отказоустойчивый пул генерации контента
					const response = await generateContentWithRetry(
						{
							model: 'gemini-2.0-flash',
							contents: prompt,
						},
						4,
						3000,
					) // 4 попытки, задержка между ними 3 секунды

					let generatedLesson = response.text

					// Дополнительная чистка от случайных Markdown-оберток кода от ИИ
					generatedLesson = generatedLesson
						.replace(/^```html?\s*/i, '')
						.replace(/```\s*$/, '')

					const keyboard = Markup.inlineKeyboard([
						[Markup.button.callback('📝 Сдать эту домашку', 'action_task')],
					])

					await sendLongMessageToUser(
						bot,
						user.telegram_id,
						generatedLesson,
						keyboard,
					)
					await new Promise(resolve => setTimeout(resolve, 200)) // Защита от флуда Telegram API (чуть увеличили для безопасности в цикле)
				}

				// 🥪 СРАБОТАЛ БУДИЛЬНИК: 13:00 ДНЯ (Дневная напоминалка о ДЗ)
				else if (userHour === 13) {
					const topicName = topics.getTopicById(user.current_day || 1)

					const lunchText =
						'🥪 <b>ВРЕМЯ ОБЕДА ИЛИ КАК ТАМ ДЗ?</b>\n' +
						'───────────────────────\n' +
						'Привет еще раз, <b>' +
						(user.first_name || 'студент') +
						'</b>! 👋\n\n' +
						'Уже середина дня. Удалось прочитать утренний ИИ-урок по теме <b>«' +
						topicName +
						'»</b>?\n\n' +
						'🎯 Если есть свободные пару минут, отправь выполненное задание прямо сюда в чат на проверку ИИ-преподавателю!'

					await bot.telegram.sendMessage(user.telegram_id, lunchText, {
						parse_mode: 'HTML',
						reply_markup: Markup.inlineKeyboard([
							[Markup.button.callback('📝 Написать домашку', 'action_task')],
						]).reply_markup,
					})
					await new Promise(resolve => setTimeout(resolve, 150))
				}

				// 🌙 СРАБОТАЛ БУДИЛЬНИК: 22:00 ВЕЧЕРА (Вечерние итоги / Сон)
				else if (userHour === 22) {
					const nightText =
						'🌙 <b>ВРЕМЯ ОТДЫХАТЬ (GOOD NIGHT)</b>\n' +
						'───────────────────────\n' +
						'Пришло время подвести итоги дня! ✨\n\n' +
						'Если ты сегодня потренировался — ты огромный молодец, шаг к свободному английскому сделан. Отложи телефон и дай мозгу отдохнуть. Спокойной ночи! Sleep tight! 😴'

					await bot.telegram.sendMessage(user.telegram_id, nightText, {
						parse_mode: 'HTML',
						reply_markup: Markup.inlineKeyboard([
							[
								Markup.button.callback(
									'🏆 Посмотреть прогресс',
									'action_profile',
								),
							],
						]).reply_markup,
					})
					await new Promise(resolve => setTimeout(resolve, 150))
				}
			} catch (err) {
				if (err.code === 403) {
					console.log(
						'🚫 Пользователь ' +
							user.telegram_id +
							' заблокировал бота. Пропускаем.',
					)
				} else {
					console.error(
						'❌ Ошибка обработки крона для юзера ' + user.telegram_id + ':',
						err.message,
					)

					// Фоллбек-сообщение на случай полного падения генерации в 7 утра
					if (userHour === 7) {
						try {
							const currentDay = user.current_day || 1
							const fallbackTopic =
								topics.getTopicById(currentDay) || 'Тема дня'
							const fallbackText =
								'☀️ <b>Good morning!</b>\n\n' +
								'Доброе утро! Время учиться. Сегодня у тебя по плану тема: <b>' +
								fallbackTopic +
								'</b>.\n\n' +
								'Жми на кнопку ниже, чтобы открыть интерактивный разбор темы прямо сейчас!'

							await bot.telegram.sendMessage(user.telegram_id, fallbackText, {
								parse_mode: 'HTML',
								reply_markup: Markup.inlineKeyboard([
									[
										Markup.button.callback(
											'📖 Открыть урок дня',
											'action_today',
										),
									],
								]).reply_markup,
							})
						} catch (fbErr) {
							console.error(
								'🔴 Полный отказ отправки для ' + user.telegram_id + ':',
								fbErr.message,
							)
						}
					}
				}
			}
		}
		console.log('✅ [Cron] Ежечасный обход часовых поясов успешно завершен.')
	})
}

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
async function fetchUsersSafely() {
	try {
		const users = await getAllUsers()
		if (!users || users.length === 0) return null
		return users
	} catch (dbError) {
		console.error(
			'❌ [Cron] Ошибка БД при получении пользователей:',
			dbError.message,
		)
		return null
	}
}
