const { Markup } = require('telegraf')
// Импортируем наш метод пула аккаунтов вместо прямого подключения GoogleGenAI
const { generateContentWithRetry } = require('../services/aiService')
const { getUserById, updateUserDay, canUseFeature, incrementFeature } = require('../services/userService')
const { sanitizeForTelegram } = require('../utils/textFormatter')

module.exports = bot => {
	function getLangSettings(ctx) {
	const lang = ctx.session?.lang || 'en'

	const data =
		lang === 'de'
			? require('../data/german_topics')
			: require('../data/topics')

const config = {
	en: {
		persona:
			"Ты — Майкл, харизматичный преподаватель американского английского, который живет в Лос-Анджелесе. Твой стиль: дружеский вайб (используй 'Hey bro!', 'Easy peasy!'), ты общаешься живо, понятно и очень подробно.",
		context: 'Лос-Анджелесе, калифорнийском солнце и серфинге',
		explainLang: 'русском языке',
	},
	de: {
		persona:
			"Ты — Майкл, харизматичный преподаватель немецкого языка, который живет в Берлине. Твой стиль: дружеский вайб (используй 'Hey bro!', 'Alles klar?', 'Easy peasy!'), ты общаешься живо, понятно и очень подробно.",
		context: 'Берлине, местной культуре и крутой столичной жизни',
		explainLang: 'русском языке', // <-- было 'немецком языке', исправил
	},
}

	return {
		lang,
		topics: data.topics,
		getTopicById: data.getTopicById,
		settings: config[lang],
	}
}

	// 1. НАЖАТИЕ НА "🎯 ВЫБОР УРОВНЯ"
	bot.action('action_lessons', async ctx => {
		await ctx.answerCbQuery().catch(() => {})

		const text =
			'🎯 <b>ВЫБОР УРОВНЯ ОБУЧЕНИЯ</b>\n' +
			'───────────────────────\n' +
			'Выбери интересующий тебя уровень, чтобы посмотреть список входящих в него тем, или открой полный каталог курсов:'

		const keyboard = Markup.inlineKeyboard([
			[
				Markup.button.callback('🟢 A1 - Starter', 'level_A1'),
				Markup.button.callback('🟡 A2 - Pre-Int', 'level_A2'),
			],
			[
				Markup.button.callback('🔵 B1 - Intermediate', 'level_B1'),
				Markup.button.callback('🔴 B2 - Upper-Int', 'level_B2'),
			],
			[
				Markup.button.callback('🟣 C1 - Advanced', 'level_C1'),
				Markup.button.callback('⚫ C2 - Proficiency', 'level_C2'),
			],
			[Markup.button.callback('📚 Показать вообще все уроки', 'level_ALL')],
			[Markup.button.callback('⬅️ Назад в меню', 'action_main_menu')],
		])

		await ctx
			.editMessageText(text, {
				parse_mode: 'HTML',
				reply_markup: keyboard.reply_markup,
			})
			.catch(err => console.log('Текст не изменился, игнорируем'))
	})

	// 2. ОБРАБОТЧИК: КЛИК ПО КОНКРЕТНОМУ УРОКУ + ГЕНЕРАЦИЯ ОБЪЯСНЕНИЯ ОТ ИИ
	bot.action(/^select_day_(\d+)$/, async ctx => {

		await ctx.answerCbQuery().catch(() => {})
	const targetDay = parseInt(ctx.match[1], 10)

	const allowed = await canUseFeature(ctx.from.id, 'lesson')
	if (!allowed) {
		return ctx.reply(
`⏳ Лимит бесплатных уроков исчерпан\n\n` +
`Вы уже заглянули в 3 урока за сегодня. Доступ обновится автоматически через 24 часа.\n\n` +
`Хотите продолжить обучение прямо сейчас?\n` +
`🚀 Для покупки подписки напишите: @scrayss`,
		)
	}
	await incrementFeature(ctx.from.id, 'lesson')

	const { topics, getTopicById, settings, lang } = getLangSettings(ctx)

	// Безопасный поиск названия темы по ID из структуры уровней
	let topicName = 'Выбранный урок'
	if (typeof getTopicById === 'function') {
		topicName = getTopicById(targetDay)
	} else {
			for (const level in topics) {
				if (Array.isArray(topics[level])) {
					const found = topics[level].find(t => t && t.id === targetDay)
					if (found) {
						topicName = found.title || found.name || topicName
						break
					}
				}
			}
		}

		// Отправляем промежуточный статус
		await ctx
			.editMessageText(
				'⏳ Майкл уже открывает свой конспект... \n\nГотовим интерактивный разбор темы: <code>День ' +
					targetDay +
					' — ' +
					topicName +
					'</code>. Секундочку, bro!',
				{ parse_mode: 'HTML' },
			)
			.catch(() => {})

		try {
			// 1. Сохраняем новый день в базу данных Postgres (Neon)
			await updateUserDay(ctx.from.id, targetDay)

			// 2. Формируем запрос к Gemini
			const prompt = `
${settings.persona}

Твоя задача — сделать МЕГА-РАЗБОР темы для студента.
Тема: "День ${targetDay} — ${topicName}"

Следуй этой структуре, пиши развёрнуто:

💡 <b>ОБЪЯСНЕНИЕ ТЕМЫ:</b>
Начни с "живой" аналогии из американской жизни (сравни правило с чем-то бытовым). Затем максимально подробно, по полочкам, объясни ЛОГИКУ использования этой темы. Пиши так, будто объясняешь близкому другу, который хочет всё понять. Используй абзацы, чтобы текст не был "кашей".

👑 <b>ГЛАВНОЕ ПРАВИЛО:</b>
Дай самую суть в виде "золотой формулы" или принципа, который поможет не совершать ошибок. Объясни, почему именно так говорят американцы.

🚀 <b>ШПАРГАЛКА-ПРИМЕРЫ С РАЗБОРОМ:</b>
Для каждого из 3 примеров сделай так:
1. Живая фраза на английском.
2. Качественный перевод.
3. "Комментарий Майкла" (почему здесь стоит именно это слово, какой подтекст у фразы, как её произносят в реальной жизни).

⚠️ КАТЕГОРИЧЕСКИЕ ПРАВИЛА ФОРМАТИРОВАНИЯ:
1. НИКАКОГО Markdown (никаких **, #, ). ИСПОЛЬЗУЙ ТОЛЬКО HTML: <b>, <code>, <i>.
2. Абсолютно ЗАПРЕЩЕНО использовать теги списков <ul>, <ol>, <li>! 
3. Текст должен быть объёмным и глубоким! Разжёвывай каждую деталь.
4. Разделяй блоки эмодзи, как в шаблоне выше.
`

			const response = await generateContentWithRetry(
				{
					model: 'gemini-2.0-flash',
					contents: prompt,
				},
				4,
				3000,
			) // 4 попытки, шаг паузы 3 секунды

			let aiExplanation = sanitizeForTelegram(response.text)

			// 🔥 ПРОГРАММНЫЙ ФИЛЬТР-ПРЕДОХРАНИТЕЛЬ:
			// Удаляем вложенные теги, которые вызывают конфликт
			aiExplanation = aiExplanation
				.replace(/<code>([\s\S]*?)<\/code>/gi, (match, content) => {
					// Удаляем любые HTML теги внутри блока code, чтобы они не ломали верстку
					const cleanContent = content.replace(/<[^>]*>/g, '')
					return `<code>${cleanContent}</code>`
				})
				.replace(/<\/?ul>/gi, '')
				.replace(/<\/?ol>/gi, '')
				.replace(/<li>/gi, '• ')
				.replace(/<\/li>/gi, '\n')

			// 3. Формируем финальное стильное сообщение
			const header =
				'✅ <b>ПРОГРАММА УСПЕШНО ИЗМЕНЕНА!</b>\n' +
				'───────────────────────\n' +
				'🎯 <b>Текущий активный урок:</b> <code>День ' +
				targetDay +
				' — ' +
				topicName +
				'</code>\n' +
				'───────────────────────\n\n'

			const footer =
				'\n───────────────────────\n' +
				'👨‍🏫 <i>"Now you are ready for some action, bro! Нажми на кнопку ниже, чтобы закрепить тему и сдать домашку!"</i>'

			const keyboard = Markup.inlineKeyboard([
				[
					Markup.button.callback(
						'📝 Сдать домашку по этой теме',
						'action_task',
					),
				],
				[
					Markup.button.callback('⬅️ Вернуться к урокам', 'action_lessons'),
					Markup.button.callback('🏠 В меню', 'action_main_menu'),
				],
			])

			const MAX = 4000
			const fullText = header + aiExplanation + footer

			if (fullText.length <= MAX) {
				// Всё влезает — обычный edit
				await ctx
					.editMessageText(fullText, {
						parse_mode: 'HTML',
						reply_markup: keyboard.reply_markup,
					})
					.catch(err => console.error('Ошибка обновления сообщения:', err))
			} else {
				// Текст длинный — редактируем первое сообщение заголовком, потом шлём части
				await ctx
					.editMessageText(
						header + '📖 <i>Урок слишком большой, отправляю по частям...</i>',
						{
							parse_mode: 'HTML',
						},
					)
					.catch(() => {})

				// Разбиваем aiExplanation на куски по 3800 символов
				let remaining = aiExplanation
				while (remaining.length > 0) {
					const chunk = remaining.slice(0, 3800)
					remaining = remaining.slice(3800)
					await ctx.reply(chunk, { parse_mode: 'HTML' }).catch(() => {})
				}

				// Последнее сообщение с кнопками
				await ctx
					.reply(footer, {
						parse_mode: 'HTML',
						reply_markup: keyboard.reply_markup,
					})
					.catch(() => {})
			}
		} catch (error) {
			console.error(
				'❌ Ошибка при смене урока или генерации ИИ:',
				error.message,
			)
			await ctx.reply(
				'⚠️ Произошла ошибка при подготовке урока через пул аккаунтов. Но курс переключен! Ты можешь перейти в раздел «📝 Сдать домашку».',
			)
		}
	})

	// 3. ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ РЕНДЕРА СПИСКА УРОКОВ
	async function renderLessonsList(ctx, targetLevel) {
		const { topics, lang } = getLangSettings(ctx)
		let userDay = 1
		try {
			const user = await getUserById(ctx.from.id)
			if (user && user.current_day) userDay = user.current_day
		} catch (err) {
			console.error(err.message)
		}

		let titleHeader = ''
		let filteredTopics = []

		if (targetLevel === 'ALL') {
			titleHeader = '📚 ВСЕ ТЕМЫ КУРСА'
			for (const levelName in topics) {
				if (Array.isArray(topics[levelName]))
					filteredTopics = filteredTopics.concat(topics[levelName])
			}
		} else {
			const exactKey = Object.keys(topics).find(key =>
				key.startsWith(targetLevel),
			)
			titleHeader = '📈 УРОВЕНЬ: ' + (exactKey || targetLevel)
			if (exactKey && Array.isArray(topics[exactKey]))
				filteredTopics = topics[exactKey]
		}

		const buttonsGrid = []
		let descriptionText = ''

		filteredTopics.forEach(topic => {
			if (topic && topic.id) {
				const isCurrent = topic.id === userDay
				buttonsGrid.push([
					Markup.button.callback(
						(isCurrent ? '🔥' : '📖') +
							' День ' +
							topic.id +
							' — ' +
							topic.title,
						'select_day_' + topic.id,
					),
				])
				if (isCurrent)
					descriptionText =
						'\n🎯 <b>Сейчас твой активный урок:</b> <code>День ' +
						topic.id +
						' — ' +
						topic.title +
						'</code>\n\n'
			}
		})

		buttonsGrid.push([
			Markup.button.callback('⬅️ К выбору уровней', 'action_lessons'),
		])

		await ctx
			.editMessageText(
				'🎯 <b>' +
					titleHeader +
					'</b>\n───────────────────────\n' +
					descriptionText +
					'👇 <b>Кликни по любому уроку ниже, чтобы переключить программу обучения и сразу получить разбор от Майкла:</b>',
				{
					parse_mode: 'HTML',
					reply_markup: Markup.inlineKeyboard(buttonsGrid).reply_markup,
				},
			)
			.catch(() => {})
	}

	// СЛУШАТЕЛИ КЛИКОВ ПО УРОВНЯМ
	bot.action('level_A1', async ctx => {
		await ctx.answerCbQuery().catch(() => {})
		await renderLessonsList(ctx, 'A1')
	})
	bot.action('level_A2', async ctx => {
		await ctx.answerCbQuery().catch(() => {})
		await renderLessonsList(ctx, 'A2')
	})
	bot.action('level_B1', async ctx => {
		await ctx.answerCbQuery().catch(() => {})
		await renderLessonsList(ctx, 'B1')
	})
	bot.action('level_B2', async ctx => {
		await ctx.answerCbQuery().catch(() => {})
		await renderLessonsList(ctx, 'B2')
	})
	bot.action('level_C1', async ctx => {
		await ctx.answerCbQuery().catch(() => {})
		await renderLessonsList(ctx, 'C1')
	})
	bot.action('level_C2', async ctx => {
		await ctx.answerCbQuery().catch(() => {})
		await renderLessonsList(ctx, 'C2')
	})
	bot.action('level_ALL', async ctx => {
		await ctx.answerCbQuery().catch(() => {})
		await renderLessonsList(ctx, 'ALL')
	})

	// Временная заглушка для напоминаний
	bot.action('action_reminders', async ctx => {
		await ctx.answerCbQuery().catch(() => {})
		await ctx
			.editMessageText(
				'🔔 <b>Настройка уведомлений</b>\n\n⚙️ Модуль умных напоминаний создается. Здесь ты сможешь настроить удобное время для ежедневных тренивок!',
				{
					parse_mode: 'HTML',
					reply_markup: Markup.inlineKeyboard([
						[Markup.button.callback('⬅️ Назад', 'action_main_menu')],
					]).reply_markup,
				},
			)
			.catch(() => {})
	})
}
