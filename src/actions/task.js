const { Markup } = require('telegraf')
const { getUserById } = require('../services/userService')

// Функция для выбора правильного файла тем
const getTopicsByLang = lang =>
	lang === 'de' ? require('../data/german_topics') : require('../data/topics')

module.exports = bot => {
	bot.action('action_task', async ctx => {
		await ctx.answerCbQuery().catch(() => {})

		ctx.session = ctx.session || {}
		ctx.session.waitingForHomework = true

		let lang = ctx.session.lang || 'en'
		let topicName = lang === 'de' ? 'Übung des Tages' : 'Общая практика'
		let currentDay = 1

		try {
			const user = await getUserById(ctx.from.id)

			// Подтягиваем язык из БД, если сессия рассинхронизировалась
			if (user?.lang && user.lang !== lang) {
				lang = user.lang
				ctx.session.lang = lang
			}

			if (user && user.current_day) {
				currentDay = user.current_day
			}

			const topicData = getTopicsByLang(lang)
			if (typeof topicData.getTopicById === 'function') {
				topicName = topicData.getTopicById(currentDay)
			}
		} catch (dbError) {
			console.error('⚠️ Не удалось загрузить данные из БД:', dbError.message)
		}

		ctx.session.currentTopic = topicName
		ctx.session.currentDay = currentDay

		const text =
			`📝 <b>ПРАКТИЧЕСКОЕ ЗАДАНИЕ</b>\n` +
			`───────────────────────\n` +
			`🎯 <b>Тема дня:</b> <code>День ${currentDay} — ${topicName}</code>\n\n` +
			`✍️ <b>Что нужно сделать:</b>\n` +
			`Выполни задание или напиши предложения по теме урока.\n\n` +
			`🤖 <i>Отправь готовый текст ответным сообщением. Наш ИИ-учитель мгновенно проверит грамматику и разберет ошибки по теме "${topicName}"!</i>`

		await ctx
			.editMessageText(text, {
				parse_mode: 'HTML',
				reply_markup: Markup.inlineKeyboard([
					[Markup.button.callback('❌ Отмена', 'action_main_menu')],
				]).reply_markup,
			})
			.catch(err => {
				if (!err.description?.includes('message is not modified')) {
					console.error('Ошибка при обновлении задания:', err.message)
				}
			})
	})
}