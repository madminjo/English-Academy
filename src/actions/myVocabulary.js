const { Markup } = require('telegraf')
const wordService = require('../services/wordService')

module.exports = bot => {
	bot.action(/action_my_vocabulary(_page_(\d+))?/, async ctx => {
		await ctx.answerCbQuery().catch(() => {})

		const page = ctx.match && ctx.match[2] ? parseInt(ctx.match[2]) : 1
		const wordsPerPage = 20

		const allWords = await wordService.getUserVocabulary(ctx.from.id)

		if (!allWords || allWords.length === 0) {
			return ctx
				.editMessageText(
					`🗂 <b>ТВОЙ ЛИЧНЫЙ СЛОВАРЬ</b>\n───────────────────────\n\n😔 Здесь пока пусто, бро. Ты еще не сохранил ни одного слова.\n\n🎯 Зайди в раздел <b>«📚 Слова дня»</b> и нажми «Сохранить»!`,
					{
						parse_mode: 'HTML',
						reply_markup: Markup.inlineKeyboard([
							[Markup.button.callback('⬅️ Назад в меню', 'action_main_menu')],
						]).reply_markup,
					},
				)
				.catch(() => {})
		}

		const totalPages = Math.ceil(allWords.length / wordsPerPage)
		const startIndex = (page - 1) * wordsPerPage
		const pageWords = allWords.slice(startIndex, startIndex + wordsPerPage)

		const formattedList = pageWords
			.map(
				(item, i) =>
					`${startIndex + i + 1}. ${item.word} — ${item.translation || ''}`,
			)
			.join('\n')

		const vocabularyText =
			`🗂 <b>ТВОЙ ЛИЧНЫЙ СЛОВАРЬ (Стр. ${page}/${totalPages})</b>\n` +
			`───────────────────────\n\n` +
			`${formattedList}\n\n` +
			`───────────────────────\n` +
			`📈 Всего выучено: <b>${allWords.length}</b> слов.`

		const navigationButtons = []
		if (page > 1)
			navigationButtons.push(
				Markup.button.callback(
					'⬅️ Назад',
					`action_my_vocabulary_page_${page - 1}`,
				),
			)
		if (page < totalPages)
			navigationButtons.push(
				Markup.button.callback(
					'Вперед ➡️',
					`action_my_vocabulary_page_${page + 1}`,
				),
			)

		await ctx
			.editMessageText(vocabularyText, {
				parse_mode: 'HTML',
				reply_markup: Markup.inlineKeyboard([
					navigationButtons,
					[
						Markup.button.callback(
							'🗑 Очистить словарь',
							'action_clear_vocabulary',
						),
					],
					[Markup.button.callback('⬅️ Главное меню', 'action_main_menu')],
				]).reply_markup,
			})
			.catch(err => console.log('Ошибка пагинации:', err.message))
	})

	bot.action('action_clear_vocabulary', async ctx => {
		await ctx.answerCbQuery().catch(() => {})
		await ctx
			.editMessageText(
				'🗑 <b>Очистка словаря</b>\n───────────────────────\n\n⚠️ Ты уверен? Все сохранённые слова будут удалены безвозвратно!',
				{
					parse_mode: 'HTML',
					reply_markup: Markup.inlineKeyboard([
						[
							Markup.button.callback(
								'✅ Да, удалить всё',
								'action_clear_vocabulary_confirm',
							),
						],
						[Markup.button.callback('❌ Отмена', 'action_my_vocabulary')],
					]).reply_markup,
				},
			)
			.catch(() => {})
	})

	bot.action('action_clear_vocabulary_confirm', async ctx => {
		await ctx.answerCbQuery().catch(() => {})
		try {
			await wordService.clearUserVocabulary(ctx.from.id)
			await ctx
				.editMessageText(
					'✅ <b>Словарь очищен!</b>\n\nВсе слова удалены. Можешь начать заново!',
					{
						parse_mode: 'HTML',
						reply_markup: Markup.inlineKeyboard([
							[Markup.button.callback('⬅️ Главное меню', 'action_main_menu')],
						]).reply_markup,
					},
				)
				.catch(() => {})
		} catch (err) {
			await ctx.reply('⚠️ Ошибка при очистке словаря').catch(() => {})
		}
	})
}
