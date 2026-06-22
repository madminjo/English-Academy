// src/middlewares/subscriptionGuard.js
const { isSubActive, canRequest } = require('../services/userService')

async function subscriptionGuard(ctx, next) {
	const ADMIN_ID = 5037778442
	if (ctx.from.id === ADMIN_ID) return next()

	try {

		const active = await isSubActive(ctx.from.id)
		const hasFreeAccess = await canRequest(ctx.from.id)

		if (!active && !hasFreeAccess) {
			const message =
				`⚠️ <b>Доступ ограничен!</b>\n\n` +
				`Ваш бесплатный период или лимит запросов исчерпан.\n\n` +
				`Чтобы продолжить обучение, приобретите подписку.\n` +
				`По вопросам: @scrayass`

			if (ctx.callbackQuery) {
				return ctx.answerCbQuery('⚠️ Доступ ограничен!', { show_alert: true })
			}
			return ctx.reply(message, { parse_mode: 'HTML' })
		}
	} catch (err) {
		console.error('Ошибка в subscriptionGuard:', err)
	}

	return next()
}

module.exports = { subscriptionGuard }
