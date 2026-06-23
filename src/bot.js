require('dotenv').config()
const { Telegraf, Markup, session } = require('telegraf')
const express = require('express')
const { sanitizeForTelegram } = require('./utils/sanitizeHtml')

const bot = new Telegraf(process.env.BOT_TOKEN)
const app = express()
const PORT = process.env.PORT || 3000

const { generateContentWithRetry } = require('./services/aiService')
const { subscriptionGuard } = require('./middlewares/subscriptionGuard')

bot.use(session())

const {
	ensureSchema,
	getAllUsers,
	getUsersByStatus,
	revokeSubscription,
	canUseFeature,
	incrementFeature,
	getUser,
	setSubscription,
} = require('./services/userService')

require('./commands/start')(bot)
require('./actions/mainMenu')(bot)
require('./actions/words')(bot)
require('./actions/task')(bot)
require('./actions/lessons')(bot)
require('./actions/myVocabulary')(bot)
require('./actions/today')(bot)
require('./cron/dailyLesson')(bot)

// --- ЧАСОВЫЕ ПОЯСА ---
async function sendTimezoneMenu(ctx, isEdit = false) {
	const text =
		'🌍 <b>НАСТРОЙКА ВРЕМЕНИ АКАДЕМИИ</b>\n───────────────────────\nБро, выбери регион, чтобы уроки приходили строго в 07:00 утра по твоему времени!'
	const keyboard = Markup.inlineKeyboard([
		[Markup.button.callback('🇰🇬 🇰🇿 🇺🇿 Средняя Азия (UTC+5/6)', 'tz_group_asia')],
		[Markup.button.callback('🇷🇺 Москва и СНГ (UTC+3)', 'tz_group_moscow')],
		[Markup.button.callback('🇪🇺 Европа (UTC+1/2)', 'tz_group_europe')],
		[Markup.button.callback('🌎 Другие пояса / США', 'tz_group_other')],
	])
	return isEdit
		? ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard })
		: ctx.replyWithHTML(text, keyboard)
}

bot.command('timezone', async ctx => await sendTimezoneMenu(ctx, false))

bot.action('tz_group_asia', async ctx => {
	await ctx.editMessageText('📍 <b>Выбери город:</b>', {
		parse_mode: 'HTML',
		...Markup.inlineKeyboard([
			[
				Markup.button.callback('Бишкек (UTC+6)', 'set_tz_Asia/Bishkek'),
				Markup.button.callback('Алматы (UTC+5)', 'set_tz_Asia/Almaty'),
			],
			[Markup.button.callback('Ташкент (UTC+5)', 'set_tz_Asia/Tashkent')],
			[Markup.button.callback('⬅️ Назад', 'tz_back')],
		]),
	})
})

bot.action('tz_group_moscow', async ctx => {
	await ctx.editMessageText('📍 <b>Выбери регион:</b>', {
		parse_mode: 'HTML',
		...Markup.inlineKeyboard([
			[
				Markup.button.callback('Москва (UTC+3)', 'set_tz_Europe/Moscow'),
				Markup.button.callback('Минск (UTC+3)', 'set_tz_Europe/Minsk'),
			],
			[Markup.button.callback('Баку (UTC+4)', 'set_tz_Asia/Baku')],
			[Markup.button.callback('⬅️ Назад', 'tz_back')],
		]),
	})
})

bot.action('tz_group_europe', async ctx => {
	await ctx.editMessageText('📍 <b>Выбери пояс:</b>', {
		parse_mode: 'HTML',
		...Markup.inlineKeyboard([
			[
				Markup.button.callback('Берлин (UTC+1)', 'set_tz_Europe/Berlin'),
				Markup.button.callback('Киев (UTC+2)', 'set_tz_Europe/Kiev'),
			],
			[Markup.button.callback('Лондон (UTC+0)', 'set_tz_Europe/London')],
			[Markup.button.callback('⬅️ Назад', 'tz_back')],
		]),
	})
})

bot.action('tz_group_other', async ctx => {
	await ctx.editMessageText('📍 <b>Популярные пояса:</b>', {
		parse_mode: 'HTML',
		...Markup.inlineKeyboard([
			[Markup.button.callback('Нью-Йорк (UTC-5)', 'set_tz_America/New_York')],
			[Markup.button.callback('Дубай (UTC+4)', 'set_tz_Asia/Dubai')],
			[Markup.button.callback('Бангкок (UTC+7)', 'set_tz_Asia/Bangkok')],
			[Markup.button.callback('⬅️ Назад', 'tz_back')],
		]),
	})
})

bot.action('tz_back', async ctx => await sendTimezoneMenu(ctx, true))

bot.action(/^set_tz_(.+)$/, async ctx => {
	ctx.session.timezone = ctx.match[1]
	await ctx.answerCbQuery('Время успешно настроено! 🔥')
	await ctx.deleteMessage().catch(() => {})
	await ctx.replyWithHTML(
		`🎯 <b>Часовой пояс <code>${ctx.session.timezone}</code> сохранен!</b>\nТеперь Майкл будет писать тебе вовремя.`,
	)
})

// --- АДМИН ---
bot.action('adm_back', async ctx => {
	const users = await getAllUsers()
	const userButtons = users.map(u => [
		Markup.button.callback(
			`${u.username || u.id} (${u.status || 'free'})`,
			`adm_manage_${u.id}`,
		),
	])
	const filterButtons = [
		[
			Markup.button.callback('🆓 Без подписки', 'adm_filter_free'),
			Markup.button.callback('💎 С подпиской', 'adm_filter_subscribed'),
		],
	]
	await ctx.editMessageText('👑 <b>СПИСОК ПОЛЬЗОВАТЕЛЕЙ:</b>', {
		parse_mode: 'HTML',
		...Markup.inlineKeyboard([...filterButtons, ...userButtons]),
	})
})

bot.command('admin', async ctx => {
	if (ctx.from.id !== 5037778442) return
	const users = await getAllUsers()
	const userButtons = users.map(u => [
		Markup.button.callback(
			`${u.username || u.id} (${u.status})`,
			`adm_manage_${u.id}`,
		),
	])
	const filterButtons = [
		[
			Markup.button.callback('🆓 Без подписки', 'adm_filter_free'),
			Markup.button.callback('💎 С подпиской', 'adm_filter_subscribed'),
		],
	]
	await ctx.reply('👑 <b>СПИСОК ПОЛЬЗОВАТЕЛЕЙ:</b>', {
		parse_mode: 'HTML',
		...Markup.inlineKeyboard([...filterButtons, ...userButtons]),
	})
})

bot.action(/^adm_manage_(\d+)$/, async ctx => {
	const userId = ctx.match[1]
	const user = await getUser(userId)
	const userInfo = `
👑 <b>Управление профилем</b>
👤 <b>Ник:</b> ${user.username || 'Нет'}
🆔 <b>ID:</b> ${user.telegram_id}
📊 <b>Статус:</b> ${user.status}
📅 <b>Подписка до:</b> ${user.sub_end_date ? user.sub_end_date.toLocaleDateString() : '—'}
`
	await ctx.editMessageText(userInfo, {
		parse_mode: 'HTML',
		...Markup.inlineKeyboard([
			[Markup.button.callback('✅ Продлить Premium', `adm_choose_term_${userId}`)],
			[Markup.button.callback('❌ Отключить подписку', `adm_off_${userId}`)],
			[Markup.button.callback('✉️ Написать пользователю', `adm_msg_${userId}`)],
			[Markup.button.callback('⬅️ Назад к списку', 'adm_back')],
		]),
	})
})

bot.action(/^adm_msg_(\d+)$/, async ctx => {
	const userId = ctx.match[1]
	ctx.session.adminWritingTo = userId
	await ctx.answerCbQuery()
	await ctx.editMessageText(
		`✉️ <b>Напиши текст сообщения для пользователя ${userId}.</b>\n\nОн придёт ему от имени бота.`,
		{
			parse_mode: 'HTML',
			...Markup.inlineKeyboard([
				[Markup.button.callback('⬅️ Отмена', `adm_manage_${userId}`)],
			]),
		},
	)
})

bot.action(/^adm_prolong_(\d+)_([a-z0-9]+)$/, async ctx => {
	const userId = ctx.match[1]
	const term = ctx.match[2]
	await setSubscription(userId, term)
	await ctx.answerCbQuery(`Подписка установлена на ${term}`)
	await ctx.editMessageText(
		`✅ <b>Пользователь ${userId} успешно переведен на статус ${term}!</b>`,
		{
			parse_mode: 'HTML',
			...Markup.inlineKeyboard([
				[Markup.button.callback('⬅️ Назад к списку', 'adm_back')],
			]),
		},
	)
})

bot.action(/^adm_filter_(free|subscribed)$/, async ctx => {
	const filter = ctx.match[1]
	const users = await getUsersByStatus(filter)
	const title =
		filter === 'free'
			? '🆓 <b>ПОЛЬЗОВАТЕЛИ БЕЗ ПОДПИСКИ:</b>'
			: '💎 <b>ПОЛЬЗОВАТЕЛИ С ПОДПИСКОЙ:</b>'
	const userButtons = users.map(u => [
		Markup.button.callback(
			`${u.username || u.id} (${u.status})`,
			`adm_manage_${u.id}`,
		),
	])
	if (userButtons.length === 0) {
		return ctx.editMessageText(`${title}\n\nПусто.`, {
			parse_mode: 'HTML',
			...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'adm_back')]]),
		})
	}
	await ctx.editMessageText(title, {
		parse_mode: 'HTML',
		...Markup.inlineKeyboard([
			...userButtons,
			[Markup.button.callback('⬅️ Назад', 'adm_back')],
		]),
	})
})

bot.action(/^adm_off_(\d+)$/, async ctx => {
	const userId = ctx.match[1]
	await revokeSubscription(userId)
	await ctx.answerCbQuery('Подписка отключена!')
	await ctx.editMessageText(
		`Пользователь <b>${userId}</b> теперь имеет статус <b>Free</b>.`,
		{
			parse_mode: 'HTML',
			...Markup.inlineKeyboard([
				[Markup.button.callback('⬅️ Назад к списку', 'adm_back')],
			]),
		},
	)
})

bot.action(/^adm_choose_term_(\d+)$/, async ctx => {
	const userId = ctx.match[1]
	await ctx.editMessageText(`<b>Выберите срок продления для ${userId}:</b>`, {
		parse_mode: 'HTML',
		...Markup.inlineKeyboard([
			[Markup.button.callback('1 Месяц', `adm_prolong_${userId}_mo1`)],
			[Markup.button.callback('3 Месяца', `adm_prolong_${userId}_mo3`)],
			[Markup.button.callback('6 Месяцев', `adm_prolong_${userId}_mo6`)],
			[Markup.button.callback('12 Месяцев', `adm_prolong_${userId}_mo12`)],
			[Markup.button.callback('⬅️ Отмена', `adm_manage_${userId}`)],
		]),
	})
})

// --- ГЛОБАЛЬНЫЙ ФЛАГ УВЕДОМЛЕНИЙ ---
let adminSpyMode = true

// --- BROADCAST (до bot.on('text')!) ---
bot.command('broadcast', async ctx => {
	if (ctx.from.id !== 5037778442) return

	const text = ctx.message.text.replace('/broadcast', '').trim()

	if (!text) {
		return ctx.reply('❌ Напиши текст сразу после команды:\n/broadcast Привет всем!')
	}

	const users = await getAllUsers()
	let success = 0
	let failed = 0

	const statusMsg = await ctx.reply(`📢 Рассылка началась... 0/${users.length}`)

	for (const user of users) {
		const targetId = user.telegram_id || user.id
		if (!targetId) continue

		try {
			await ctx.telegram.sendMessage(targetId, text, { parse_mode: 'HTML' })
			success++
		} catch (err) {
			failed++
			console.error(`❌ Не удалось отправить юзеру ${targetId}:`, err.message)
		}

		if ((success + failed) % 20 === 0) {
			await ctx.telegram.editMessageText(
				ctx.chat.id, statusMsg.message_id, undefined,
				`📢 Рассылка в процессе... ${success + failed}/${users.length}`,
			).catch(() => {})
		}

		await new Promise(resolve => setTimeout(resolve, 50))
	}

	await ctx.telegram.editMessageText(
		ctx.chat.id, statusMsg.message_id, undefined,
		`✅ <b>Рассылка завершена!</b>\n\n📤 Успешно: ${success}\n❌ Не доставлено: ${failed}`,
		{ parse_mode: 'HTML' },
	)
})

// --- ОБРАБОТКА ТЕКСТА ---
bot.on('text', async ctx => {

	// 📩 Пересылаем сообщения пользователей админу
	if (ctx.from.id !== 5037778442 && adminSpyMode) {
		await ctx.telegram.sendMessage(
			5037778442,
			`👤 <b>${ctx.from.first_name}</b> (@${ctx.from.username || 'нет'}, ID: <code>${ctx.from.id}</code>)\n${ctx.from.username ? `🔗 <a href="https://t.me/${ctx.from.username}">Открыть аккаунт</a>` : `🔗 <a href="tg://user?id=${ctx.from.id}">Открыть аккаунт</a>`}\n\n${ctx.message.text}`,
			{
				parse_mode: 'HTML',
				...Markup.inlineKeyboard([
					[Markup.button.callback('🔕 Отключить уведомления', 'spy_off')],
				]),
			},
		).catch(() => {})
	}

	// ✉️ Если админ отвечает конкретному пользователю
	if (ctx.from.id === 5037778442 && ctx.session?.adminWritingTo) {
		const targetId = ctx.session.adminWritingTo
		ctx.session.adminWritingTo = null
		try {
			await ctx.telegram.sendMessage(targetId, ctx.message.text, { parse_mode: 'HTML' })
			await ctx.reply(`✅ Сообщение отправлено пользователю ${targetId}`)
		} catch (err) {
			await ctx.reply(`❌ Не удалось отправить: ${err.message}`)
		}
		return
	}

	if (!ctx.session?.waitingForHomework) return

	// Проверка лимита домашки
	const allowed = await canUseFeature(ctx.from.id, 'homework')
	if (!allowed) {
		ctx.session.waitingForHomework = false
		return ctx.replyWithHTML(
			`⏳ <b>Лимит бесплатных проверок исчерпан!</b>\n\n` +
				`Ты использовал все доступные запросы к ИИ-учителю (3 из 3 за сегодня). Новые проверки откроются автоматически через 24 часа.\n\n` +
				`🚀 <b>Хочешь проверять домашку без ограничений?</b>\n` +
				`Для оформления подписки напиши нам: @scrayass`,
			Markup.inlineKeyboard([
				[Markup.button.url('💎 Купить подписку', 'https://t.me/scrayass')],
				[Markup.button.callback('⬅️ В меню', 'action_main_menu')],
			]),
		)
	}

	const lang = ctx.session?.lang || 'en'
	const langName = lang === 'de' ? 'Немецком' : 'Английском'

	const userHomework = ctx.message.text
	const currentTopic =
		ctx.session.currentTopic ||
		(lang === 'de' ? 'Allgemeines Deutsch' : 'General English')
	ctx.session.waitingForHomework = false

	const waitingMsg = await ctx.reply('🔄 ИИ-Учитель проверяет твою работу...')

	const remaining = await incrementFeature(ctx.from.id, 'homework')
	console.log(`Пользователь ${ctx.from.id} потратил запрос. Осталось/Всего: ${remaining}`)

	try {
		const prompt = `Ты — Майкл, преподаватель с 40-летним опытом. 
    Проверь текст, написанный на ${langName}: "${userHomework}". 
    Тема: "${currentTopic}". 
    Дай разбор на ${langName} языке: ❌ ОШИБКИ, 📝 ИДЕАЛЬНАЯ ВЕРСИЯ, 💡 ПОЧЕМУ ТАК?, 🚀 СЛЕНГ, 🎯 ЗАДАНИЕ, 🌟 СОВЕТ. Используй HTML.`

		const response = await generateContentWithRetry(
			{ model: 'gemini-2.0-flash', contents: prompt },
			3,
			2500,
		)

		await ctx.telegram.deleteMessage(ctx.chat.id, waitingMsg.message_id).catch(() => {})

		await sendLongMessage(
			ctx,
			sanitizeForTelegram(response.text),
			Markup.inlineKeyboard([
				[
					Markup.button.callback('📖 Урок дня', 'action_today'),
					Markup.button.callback('⬅️ В меню', 'action_main_menu'),
				],
			]),
		)
	} catch (error) {
		console.error(error)
		await ctx.reply('⚠️ Ошибка ИИ. Попробуй позже.')
	}
})

// --- КНОПКИ УВЕДОМЛЕНИЙ ---
bot.action('spy_off', async ctx => {
	adminSpyMode = false
	await ctx.answerCbQuery('🔕 Уведомления отключены!')
	await ctx.editMessageReplyMarkup(
		Markup.inlineKeyboard([
			[Markup.button.callback('🔔 Включить уведомления', 'spy_on')],
		]).reply_markup,
	).catch(() => {})
})

bot.action('spy_on', async ctx => {
	adminSpyMode = true
	await ctx.answerCbQuery('🔔 Уведомления включены!')
	await ctx.editMessageReplyMarkup(
		Markup.inlineKeyboard([
			[Markup.button.callback('🔕 Отключить уведомления', 'spy_off')],
		]).reply_markup,
	).catch(() => {})
})

// --- ПРОФИЛЬ ---
bot.action('action_profile', async ctx => {
	await ctx.answerCbQuery().catch(() => {})
	const { getUser } = require('./services/userService')
	const user = await getUser(ctx.from.id)
	if (!user) {
		return ctx.reply('Сначала нажми /start!')
	}
	const statusDisplay =
		user.status === 'free'
			? '🆓 Free'
			: `💎 Premium (${user.status.toUpperCase()})`
	const profileText = `
👤 <b>Твой профиль:</b>
───────────────────────
🆔 <b>ID:</b> ${user.telegram_id}
📛 <b>Имя:</b> ${user.first_name || '—'}
👑 <b>Статус:</b> ${statusDisplay}
📅 <b>Подписка до:</b> ${user.sub_end_date ? new Date(user.sub_end_date).toLocaleDateString() : '—'}
📈 <b>Уровень:</b> ${user.level}
🔥 <b>Стрик:</b> ${user.streak} дней
🧠 <b>Выучено слов:</b> ${user.words_learned}
`
	await ctx.editMessageText(profileText, {
		parse_mode: 'HTML',
		...Markup.inlineKeyboard([
			[Markup.button.callback('💎 Тарифы', 'action_pricing')],
			[Markup.button.callback('🌍 Изменить язык', 'action_select_lang')],
			[Markup.button.callback('⬅️ В меню', 'action_main_menu')],
		]),
	})
})

bot.action('action_settings', async ctx => {
	await ctx.answerCbQuery().catch(() => {})
	await sendTimezoneMenu(ctx, true)
})

bot.action('action_select_lang', async ctx => {
	await ctx.editMessageText('🌍 <b>Выбери язык обучения:</b>', {
		parse_mode: 'HTML',
		...Markup.inlineKeyboard([
			[Markup.button.callback('🇬🇧 Английский', 'set_lang_en')],
			[Markup.button.callback('🇩🇪 Немецкий', 'set_lang_de')],
			[Markup.button.callback('⬅️ Назад', 'action_profile')],
		]),
	})
})

bot.action(/set_lang_(en|de)/, async ctx => {
	ctx.session = ctx.session || {}
	const lang = ctx.match[1]
	const { updateUserLanguage } = require('./services/userService')
	await updateUserLanguage(ctx.from.id, lang)
	ctx.session.lang = lang
	await ctx.answerCbQuery('Язык обновлен!')
	await ctx
		.editMessageText(
			`✅ <b>Язык успешно изменен на ${lang === 'de' ? 'Немецкий' : 'Английский'}!</b>`,
			{
				parse_mode: 'HTML',
				...Markup.inlineKeyboard([
					[Markup.button.callback('⬅️ В профиль', 'action_profile')],
				]),
			},
		)
		.catch(err => console.error('Ошибка:', err))
})

// --- ТАРИФЫ ---
bot.action('action_pricing', async ctx => {
	await ctx.answerCbQuery().catch(() => {})
	const pricingText = `
💎 <b>ТАРИФЫ АКАДЕМИИ</b>
───────────────────────
🆓 <b>Free</b> — 3 запроса к ИИ-учителю в день
───────────────────────
📅 <b>1 месяц</b>
🇰🇬 399 сом / 🇷🇺 359 ₽ / 🇺🇸 $4.7

📅 <b>3 месяца</b> <i>(экономия ~17%)</i>
🇰🇬 999 сом / 🇷🇺 899 ₽ / 🇺🇸 $11.7

📅 <b>6 месяцев</b> <i>(экономия ~25%)</i>
🇰🇬 1799 сом / 🇷🇺 1619 ₽ / 🇺🇸 $21

📅 <b>12 месяцев</b> <i>(экономия ~37%)</i>
🇰🇬 2999 сом / 🇷🇺 2699 ₽ / 🇺🇸 $35

✅ Без лимитов на проверку домашки и уроки
───────────────────────
По вопросам оплаты: @scrayass
`
	await ctx.editMessageText(pricingText, {
		parse_mode: 'HTML',
		...Markup.inlineKeyboard([
			[Markup.button.url('💳 Купить подписку', 'https://t.me/scrayass')],
			[Markup.button.callback('⬅️ В меню', 'action_main_menu')],
		]),
	})
})

// --- ДОКУМЕНТЫ ---
bot.action('action_docs', async ctx => {
	await ctx.editMessageText(
		'📄 <b>Документы и поддержка</b>\n\nВыберите нужный пункт:',
		{
			parse_mode: 'HTML',
			...Markup.inlineKeyboard([
				[Markup.button.url('📄 Политика конфиденциальности', 'https://telegra.ph/Politika-konfidencialnosti-06-23-56')],
				[Markup.button.url('📜 Пользовательское соглашение', 'https://telegra.ph/Polzovatelskoe-soglasheni-06-23')],
				[Markup.button.url('🛠 Поддержка', 'https://t.me/scrayass')],
				[Markup.button.callback('⬅️ В меню', 'action_main_menu')],
			]),
		},
	)
})

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
async function sendLongMessage(ctx, text, keyboard = null) {
	const chunks = text.length <= 4000 ? [text] : text.match(/.{1,4000}/gs)
	for (const chunk of chunks) {
		try {
			await ctx.replyWithHTML(
				chunk,
				chunk === chunks[chunks.length - 1] ? keyboard : undefined,
			)
		} catch (err) {
			console.error('Ошибка parse_mode HTML, отправляю как plain text:', err.message)
			await ctx.reply(
				chunk.replace(/<[^>]+>/g, ''),
				chunk === chunks[chunks.length - 1] ? keyboard : undefined,
			)
		}
	}
}

// --- СЕРВЕР И ЗАПУСК ---
app.use(express.json())
app.get('/', (req, res) => res.send('🤖 Academy is running!'))

async function startBot() {
	await ensureSchema()

	const RENDER_URL = process.env.RENDER_EXTERNAL_URL
	if (RENDER_URL) {
		const secretPath = `/telegraf/${bot.secretPathComponent()}`
		app.use(bot.webhookCallback(secretPath))
		app.listen(PORT, async () => {
			await bot.telegram.setWebhook(`${RENDER_URL}${secretPath}`)
			console.log('🚀 Бот запущен (WEBHOOK)')
		})
	} else {
		app.listen(PORT, () =>
			console.log(`🚀 Бот запущен (LOCAL) на порту ${PORT}`),
		)
		bot.launch()
	}
}

startBot()
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))