const { Markup } = require('telegraf')

module.exports = bot => {
	bot.action('action_main_menu', async ctx => {
		await ctx.answerCbQuery().catch(() => {})

		ctx.session = ctx.session || {}
		ctx.session.waitingForHomework = false

		// Определяем, какой курс сейчас активен
		const lang = ctx.session.lang || 'en'

		// Динамический заголовок: если немецкий — приветствуем на немецком, если английский — на английском
		const welcomeGreeting = lang === 'de' ? 'Willkommen zurück' : 'Welcome back'

		const academyName =
			lang === 'de' ? 'GERMAN LANGUAGE ACADEMY' : 'AMERICAN ENGLISH ACADEMY'

		const htmlMessage =
			`🎓 <b>${academyName}</b>\n` +
			`───────────────────────\n` +
			`${welcomeGreeting}, <b>${ctx.from.first_name || 'студент'}</b>! 👋\n\n` +
			`🤖 <b>Твой ИИ-тренажер Майкл на связи и готов к работе.</b>\n` +
			`Выбирай раздел на панели ниже, чтобы продолжить прокачку языка:\n` +
			`───────────────────────`

		await ctx
			.editMessageText(htmlMessage, {
				parse_mode: 'HTML',
				reply_markup: Markup.inlineKeyboard([
					[
						Markup.button.callback('📖 Урок дня', 'action_today'),
						Markup.button.callback('📚 Слова дня', 'action_words'),
					],
					[
						Markup.button.callback('🗂 Мой словарь', 'action_my_vocabulary'),
						Markup.button.callback('📝 Сдать домашку', 'action_task'),
					],
					[
						Markup.button.callback('👤 Профиль', 'action_profile'),
						Markup.button.callback('🎯 Уровни', 'action_lessons'),
					],
					[Markup.button.callback('⚙️ Настройки времени', 'action_settings')],
				]).reply_markup,
			})
			.catch(err => console.log('Текст не изменился, игнорируем'))
	})
}
