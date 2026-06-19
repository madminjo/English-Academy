const { Markup } = require('telegraf')
const db = require('../services/dbService')
const { getUserById, checkLessonAccess, incrementLessons } = require('../services/userService')
const { generateContentWithRetry } = require('../services/aiService')
const { sanitizeForTelegram } = require('../utils/sanitizeHtml')

const getTopicsByLang = lang =>
	lang === 'de'
		? require('../data/german_topics').topics
		: require('../data/topics').topics

const getLessonPrompt = (topicName, targetDay, lang) => {
	const isGerman = lang === 'de'
	const persona = isGerman
		? "Ты — Майкл, харизматичный преподаватель немецкого языка, живущий в Берлине. Твой стиль: дружеский вайб ('Hey bro!', 'Alles klar?', 'Easy peasy!'), объясняешь очень подробно и живо. ВАЖНО: все объяснения, разборы ошибок и комментарии пиши ТОЛЬКО на русском языке (немецкие слова используй только как примеры в кавычках или для иллюстрации грамматики). Используй простой, разговорный русский, без канцелярита, как будто объясняешь другу. Можешь вставлять немецкие фразочки и сленг для атмосферы, но основной смысл — всегда по-русски."
		: "Ты — Майкл, харизматичный преподаватель американского английского, живущий в Лос-Анджелесе. Твой стиль: дружеский вайб ('Hey bro!', 'Easy peasy!'), объясняешь очень подробно и живо. ВАЖНО: все объяснения, разборы ошибок и комментарии пиши ТОЛЬКО на русском языке (английские слова используй только как примеры в кавычках или для иллюстрации грамматики). Используй простой, разговорный русский, без канцелярита, как будто объясняешь другу. Можешь вставлять английские фразочки и сленг для атмосферы, но основной смысл — всегда по-русски."

	const context = isGerman
		? 'Берлине и местной культуре'
		: 'Лос-Анджелесе, калифорнийском солнце и серфинге'

	return `${persona}
    Твоя задача — сделать МЕГА-РАЗБОР темы: "День ${targetDay} — ${topicName}"
    
    💡 ОБЪЯСНЕНИЕ ТЕМЫ:
    Начни с живой аналогии из жизни в ${context}. Объясни логику максимально детально, будто близкому другу.
    
    👑 ГЛАВНОЕ ПРАВИЛО:
    Дай суть в виде "золотой формулы" или принципа.
    
    🚀 ШПАРГАЛКА-ПРИМЕРЫ С РАЗБОРОМ:
    Напиши 3 примера: 1. Фраза. 2. Перевод. 3. Комментарий Майкла (почему так говорят в реальной жизни).
    
    ⚠️ ПРАВИЛА ФОРМАТИРОВАНИЯ:
    1. ИСПОЛЬЗУЙ ТОЛЬКО HTML: <b>, <code>, <i>.
    2. НИКАКОГО Markdown (**, #).
    3. НИКАКИХ <!DOCTYPE>, <html>, <head>, <body>, <ul>, <li>, <div> — только чистый текст с <b>/<i>/<code> и переносами строк.
    4. Текст должен быть объёмным и глубоким!`
}

async function sendSplitMessage(ctx, text, keyboard) {
	const MAX_LENGTH = 3800
	const parts = []
	let remaining = text

	while (remaining.length > 0) {
		let chunk = remaining.slice(0, MAX_LENGTH)
		if (remaining.length > MAX_LENGTH) {
			const lastNewline = chunk.lastIndexOf('\n')
			if (lastNewline > MAX_LENGTH / 2) chunk = chunk.slice(0, lastNewline)
		}
		parts.push(chunk)
		remaining = remaining.slice(chunk.length)
	}

	for (let i = 0; i < parts.length; i++) {
		const isLast = i === parts.length - 1
		try {
			await ctx.reply(parts[i], {
				parse_mode: 'HTML',
				...(isLast && keyboard ? { reply_markup: keyboard.reply_markup } : {}),
			})
		} catch (err) {
			console.error('⚠️ Ошибка parse_mode HTML, отправляю как plain text:', err.message)
			await ctx.reply(parts[i].replace(/<[^>]*>/g, ''), {
				...(isLast && keyboard ? { reply_markup: keyboard.reply_markup } : {}),
			})
		}
	}
}

module.exports = bot => {
	bot.action('action_today', async ctx => {
		await ctx.answerCbQuery().catch(() => {})

		if (!ctx.session) ctx.session = {}

		let lang = ctx.session.lang || 'en'
		let currentDay = 1
		let currentTopic = 'Урок дня'

		try {
			const user = await getUserById(ctx.from.id)

			if (user?.lang && user.lang !== lang) {
				lang = user.lang
				ctx.session.lang = lang
			}
			if (user?.current_day) {
				currentDay = user.current_day
			}

			const topicsObj = getTopicsByLang(lang)
			const allTopics = Object.values(topicsObj).flat()
			const found = allTopics.find(t => t.id === currentDay)
			currentTopic = found?.title || currentTopic
		} catch (err) {
			console.error('Ошибка БД / поиска темы:', err.message)
		}

		// 1. Проверка лимита (с учётом повторного открытия того же урока)
		const access = await checkLessonAccess(ctx.from.id, currentDay)
		if (!access.allowed) {
			return ctx.reply(
				'⚠️ <b>Лимит уроков на сегодня исчерпан!</b>\nПриходи завтра или оформи подписку для безлимитного доступа, bro.',
				{ parse_mode: 'HTML' },
			)
		}

		const statusMsg = await ctx
			.replyWithHTML('⏳ <b>Майкл открывает конспект...</b>')
			.catch(() => {})

		let lessonText = null

		try {
			const cached = await db.query(
				'SELECT lesson_text FROM generated_lessons WHERE day_number = $1 AND lang = $2',
				[currentDay, lang],
			)
			if (cached.rows?.length > 0) {
				lessonText = cached.rows[0].lesson_text
			}
		} catch (dbErr) {
			console.error('Ошибка кэша:', dbErr.message)
		}

		if (!lessonText) {
			try {
				const response = await generateContentWithRetry(
					{
						model: 'gemini-2.0-flash',
						contents: getLessonPrompt(currentTopic, currentDay, lang),
					},
					4,
					3000,
				)

				if (!response || !response.text) {
					throw new Error('Пустой ответ от ИИ')
				}

				lessonText = sanitizeForTelegram(response.text)

				try {
					await db.query(
						'INSERT INTO generated_lessons (day_number, topic_name, lesson_text, lang) VALUES ($1, $2, $3, $4) ON CONFLICT (day_number, lang) DO NOTHING',
						[currentDay, currentTopic, lessonText, lang],
					)
				} catch (cacheErr) {
					console.error('⚠️ Не удалось закэшировать урок (но отправим юзеру):', cacheErr.message)
				}
			} catch (error) {
				console.error('DEBUG [today.js]:', error.message)
				if (statusMsg) {
					await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {})
				}
				return ctx.reply('⚠️ Ошибка генерации. Попробуй позже, bro!')
			}
		} else {
			lessonText = sanitizeForTelegram(lessonText)
		}

		if (statusMsg) {
			await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {})
		}

		const keyboard = Markup.inlineKeyboard([
			[Markup.button.callback('📚 Слова к уроку', 'action_words')],
			[
				Markup.button.callback('📝 Домашка', 'action_task'),
				Markup.button.callback('⬅️ В меню', 'action_main_menu'),
			],
		])

		await sendSplitMessage(ctx, lessonText, keyboard)

		// 2. Засчитываем открытие только если это НЕ повторный просмотр того же урока сегодня
		if (!access.alreadyOpenedToday) {
			const remaining = await incrementLessons(ctx.from.id, currentDay)
			console.log(`Пользователь ${ctx.from.id} открыл урок ${currentDay}. Открыто за день: ${remaining}`)
		} else {
			console.log(`Пользователь ${ctx.from.id} повторно открыл урок ${currentDay} сегодня — лимит не тратится`)
		}
	})
}