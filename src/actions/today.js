const { Markup } = require('telegraf')
// Динамически определяем, какие темы грузить
const getTopicsByLang = lang =>
	lang === 'de' ? require('../data/german_topics') : require('../data/topics')

const { getUserById } = require('../services/userService')
const { generateContentWithRetry } = require('../services/aiService')
const db = require('../services/dbService')

// Генератор промпта с учетом контекста Майкла
const getLessonPrompt = (topicName, targetDay, lang) => {
	const isGerman = lang === 'de'
	const persona = isGerman
		? "Ты — Майкл, харизматичный преподаватель немецкого языка, живущий в Берлине. Твой стиль: дружеский вайб ('Hey bro!', 'Alles klar?', 'Easy peasy!'), объясняешь очень подробно и живо."
		: "Ты — Майкл, харизматичный преподаватель американского английского, живущий в Лос-Анджелесе. Твой стиль: дружеский вайб ('Hey bro!', 'Easy peasy!'), объясняешь очень подробно и живо."

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
    3. Текст должен быть объёмным и глубоким!`
}

async function sendSplitMessage(ctx, text, keyboard) {
	const MAX_LENGTH = 3800
	const parts = []
	let remaining = text

	while (remaining.length > 0) {
		let chunk = remaining.slice(0, MAX_LENGTH)
		// Ищем последний перенос строки чтобы не резать тег посередине
		if (remaining.length > MAX_LENGTH) {
			const lastNewline = chunk.lastIndexOf('\n')
			if (lastNewline > MAX_LENGTH / 2) chunk = chunk.slice(0, lastNewline)
		}
		parts.push(chunk)
		remaining = remaining.slice(chunk.length)
	}

	for (let i = 0; i < parts.length; i++) {
		const isLast = i === parts.length - 1
		// Если тег не закрыт — шлём без parse_mode
		try {
			await ctx.reply(parts[i], {
				parse_mode: 'HTML',
				...(isLast && keyboard ? { reply_markup: keyboard.reply_markup } : {}),
			})
		} catch {
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
		const lang = ctx.session.lang || 'en'
		const topics = getTopicsByLang(lang)

		let currentDay = 1
		let currentTopic = 'Урок дня'

		try {
			const user = await getUserById(ctx.from.id)
			if (user?.current_day) {
				currentDay = user.current_day
				// Поиск темы в зависимости от структуры
				const allTopics = Object.values(topics).flat()
				const found = allTopics.find(t => t.id === currentDay)
				currentTopic = found?.title || currentTopic
			}
		} catch (err) {
			console.error('Ошибка БД:', err.message)
		}

		const statusMsg = await ctx
			.replyWithHTML('⏳ <b>Майкл открывает конспект...</b>')
			.catch(() => {})

		// Кэш с учетом языка
		let lessonText = null
		try {
			const cached = await db.query(
				'SELECT lesson_text FROM generated_lessons WHERE day_number = $1 AND lang = $2',
				[currentDay, lang],
			)
			if (cached.rows?.length > 0) {
				lessonText = response.text
					.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
					.replace(/<br\s*\/?>/gi, '\n')
					.replace(
						/<\/?(?!b|\/b|i|\/i|code|\/code|u|\/u)([a-zA-Z][^>]*)>/gi,
						'',
					)
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

				lessonText = response.text
					.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
					.replace(/<br\s*\/?>/gi, '\n')
					.replace(/<\/?(?!b>|\/b>|i>|\/i>|code>|\/code>|u>|\/u>)[^>]+>/gi, '')
				if (!response || !response.text) {
					throw new Error('Пустой ответ от ИИ')
				}

				await db.query(
					'INSERT INTO generated_lessons (day_number, topic_name, lesson_text, lang) VALUES ($1, $2, $3, $4) ON CONFLICT (day_number, lang) DO NOTHING',
					[currentDay, currentTopic, lessonText, lang],
				)
			} catch (error) {
				console.error('DEBUG [today.js]:', error.message) // ДОБАВЬ ЭТО
				await ctx.telegram
					.deleteMessage(ctx.chat.id, statusMsg.message_id)
					.catch(() => {})
				return ctx.reply('⚠️ Ошибка генерации. Попробуй позже, bro!')
			}
		}

		await ctx.telegram
			.deleteMessage(ctx.chat.id, statusMsg.message_id)
			.catch(() => {})

		const keyboard = Markup.inlineKeyboard([
			[Markup.button.callback('📚 Слова к уроку', 'action_words')],
			[
				Markup.button.callback('📝 Домашка', 'action_task'),
				Markup.button.callback('⬅️ В меню', 'action_main_menu'),
			],
		])

		await sendSplitMessage(ctx, lessonText, keyboard)
	})
}
