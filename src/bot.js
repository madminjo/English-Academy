require('dotenv').config()
const { Telegraf, Markup, session } = require('telegraf')
const express = require('express')
const { sanitizeForTelegram } = require('./utils/sanitizeHtml')

// Инициализация бота
const bot = new Telegraf(process.env.BOT_TOKEN)
const app = express()
const PORT = process.env.PORT || 3000

// Сервисы и Middleware
const { generateContentWithRetry } = require('./services/aiService')
// Блокировку subscriptionGuard импортируем, но убираем из глобального использования
const { subscriptionGuard } = require('./middlewares/subscriptionGuard')

// Включаем сессии
bot.use(session())

// 🔥 УБРАНО: bot.use(subscriptionGuard) больше не блокирует всех подряд на входе!
// Теперь любой пользователь может начать диалог с Майклом.

const {
  ensureSchema,
  getAllUsers,
  revokeSubscription,
  canRequest,
  incrementRequests,
  getUser,
  setSubscription,
} = require('./services/userService')

// --- СВЯЗЫВАЕМ МОДУЛИ ---
require('./commands/start')(bot)
// require('./commands/profile')(bot);

require('./actions/mainMenu')(bot)
require('./actions/words')(bot)
require('./actions/task')(bot)
require('./actions/lessons')(bot)
require('./actions/myVocabulary')(bot)
require('./actions/today')(bot)

require('./cron/dailyLesson')(bot)

// --- 🌍 НАСТРОЙКА ЧАСОВЫХ ПОЯСОВ ---
async function sendTimezoneMenu(ctx, isEdit = false) {
  const text =
    '🌍 <b>НАСТРОЙКА ВРЕМЕНИ АКАДЕМИИ</b>\n───────────────────────\nБро, выбери регион, чтобы уроки приходили строго в 07:00 утра по твоему времени!'
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback(
        '🇰🇬 🇰🇿 🇺🇿 Средняя Азия (UTC+5/6)',
        'tz_group_asia',
      ),
    ],
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

bot.action('adm_back', async ctx => {
  const users = await getAllUsers()
  const buttons = users.map(u => [
    Markup.button.callback(
      `${u.username || u.id} (${u.status || 'free'})`,
      `adm_manage_${u.id}`,
    ),
  ])

  await ctx.editMessageText('👑 <b>СПИСОК ПОЛЬЗОВАТЕЛЕЙ:</b>', {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons),
  })
})

bot.command('admin', async ctx => {
  if (ctx.from.id !== 5037778442) return

  const users = await getAllUsers()
  const buttons = users.map(u => [
    Markup.button.callback(
      `${u.username || u.id} (${u.status})`,
      `adm_manage_${u.id}`,
    ),
  ])

  await ctx.reply('👑 <b>СПИСОК ПОЛЬЗОВАТЕЛЕЙ:</b>', {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons),
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
      [
        Markup.button.callback(
          '✅ Продлить Premium',
          `adm_choose_term_${userId}`,
        ),
      ],
      [Markup.button.callback('❌ Отключить подписку', `adm_off_${userId}`)],
      [Markup.button.callback('⬅️ Назад к списку', 'adm_back')],
    ]),
  })
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

// --- ОБРАБОТКА ТЕКСТА (ДОМАШКА) ---
bot.on('text', async ctx => {
  if (!ctx.session.waitingForHomework) return

  // 1. Проверка лимитов запросов
  const allowed = await canRequest(ctx.from.id)
  if (!allowed) {
    return ctx.reply('⚠️ <b>Лимит исчерпан!</b> На сегодня бесплатные запросы закончились, bro.', { parse_mode: 'HTML' })
  }

  // 2. ОПРЕДЕЛЕНИЕ ЯЗЫКА
  const lang = ctx.session.lang || 'en'
  const langName = lang === 'de' ? 'Немецком' : 'Английском'

  const userHomework = ctx.message.text
  const currentTopic =
    ctx.session.currentTopic ||
    (lang === 'de' ? 'Allgemeines Deutsch' : 'General English')
  ctx.session.waitingForHomework = false

  const waitingMsg = await ctx.reply('🔄 ИИ-Учитель проверяет твою работу...')

  // Уменьшаем баланс запросов (вызываем один раз, дубликат удален)
  const remaining = await incrementRequests(ctx.from.id)
  console.log(
    `Пользователь ${ctx.from.id} потратил запрос. Осталось/Всего: ${remaining}`,
  )

  try {
    // 3. ДИНАМИЧЕСКИЙ ПРОМПТ
    const prompt = `Ты — Майкл, преподаватель с 40-летним опытом. 
    Проверь текст, написанный на ${langName}: "${userHomework}". 
    Тема: "${currentTopic}". 
    Дай разбор на ${langName} языке: ❌ ОШИБКИ, 📝 ИДЕАЛЬНАЯ ВЕРСИЯ, 💡 ПОЧЕМУ ТАК?, 🚀 СЛЕНГ, 🎯 ЗАДАНИЕ, 🌟 СОВЕТ. Используй HTML.`

    const response = await generateContentWithRetry(
      { model: 'gemini-2.0-flash', contents: prompt },
      3,
      2500,
    )

    await ctx.telegram
      .deleteMessage(ctx.chat.id, waitingMsg.message_id)
      .catch(() => {})
      
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

// Обработчик нажатия на кнопку "👤 Профиль" в меню
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
    .catch(err => console.error('Ошибка при обнаружении сообщения:', err))
})

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
async function sendLongMessage(ctx, text, keyboard = null) {
  const chunks = text.length <= 4000 ? [text] : text.match(/.{1,4000}/gs)
  for (const chunk of chunks) {
    try {
      await ctx.replyWithHTML(chunk, chunk === chunks[chunks.length - 1] ? keyboard : undefined)
    } catch (err) {
      console.error('Ошибка parse_mode HTML, отправляю как plain text:', err.message)
      await ctx.reply(chunk.replace(/<[^>]+>/g, ''), chunk === chunks[chunks.length - 1] ? keyboard : undefined)
    }
  }
}

// --- СЕРВЕР И ЗАПУСК ---
app.use(express.json())
app.get('/', (req, res) => res.send('🤖 Academy is running!'))

async function startBot() {
  await ensureSchema() // <-- добавляем сюда, до webhook/launch

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