require('dotenv').config()
const { Telegraf, Markup, session } = require('telegraf')

const bot = new Telegraf(process.env.BOT_TOKEN)

// Включаем сессии
bot.use(session())

// 🔥 УБРАЛИ ПРЯМОЙ ИМПОРТ @google/genai И ПОДКЛЮЧАЕМ НАШ СЕРВИС С РОТАЦИЕЙ КЛЮЧЕЙ
const { generateContentWithRetry } = require('./services/aiService')

// --- СВЯЗЫВАЕМ СТРУКТУРУ ПРОЕКТА (ПОДКЛЮЧАЕМ МОДУЛИ) ---

// 1. Текстовые команды (/start, /today и т.д.)
require('./commands/start')(bot)
// require("./commands/today")(bot);
require('./commands/profile')(bot)

// 2. Инлайн-кнопки (наше разделение по файлам)
require('./actions/mainMenu')(bot)
require('./actions/words')(bot)
require('./actions/task')(bot)
require('./actions/lessons')(bot)
require('./actions/myVocabulary')(bot)
require('./actions/today')(bot)

// 3. Крон-планировщик рассылок
require('./cron/dailyLesson')(bot)


// 🌍 --- НАСТРОЙКА ЧАСОВЫХ ПОЯСОВ (ПО КОМАНДЕ /TIMEZONE С АВТОУДАЛЕНИЕМ) ---

// Функция генерации главного меню часовых поясов
async function sendTimezoneMenu(ctx, isEdit = false) {
  const text = 
    '🌍 <b>НАСТРОЙКА ВРЕМЕНИ АКАДЕМИИ</b>\n' +
    '───────────────────────\n' +
    'Бро, выбери свой регион или часовой пояс, чтобы уникальные уроки от Майкла приходили строго в <b>07:00 утра</b> по твоему местному времени!'

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🇰🇬 🇰🇿 🇺🇿 Средняя Азия (UTC+5 / UTC+6)', 'tz_group_asia')],
    [Markup.button.callback('🇷🇺 Москва и СНГ (UTC+3)', 'tz_group_moscow')],
    [Markup.button.callback('🇪🇺 Европа (UTC+1 / UTC+2)', 'tz_group_europe')],
    [Markup.button.callback('🌎 Другие пояса / США', 'tz_group_other')]
  ])

  if (isEdit) {
    return ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard })
  } else {
    return ctx.replyWithHTML(text, keyboard)
  }
}

// Вызывается ТОЛЬКО когда пользователь сам вводит /timezone
bot.command('timezone', async (ctx) => {
  await sendTimezoneMenu(ctx, false)
})

// Подменю 1: Азия
bot.action('tz_group_asia', async (ctx) => {
  await ctx.editMessageText('📍 <b>Выбери свой город:</b>', {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('Бишкек (UTC+6)', 'set_tz_Asia/Bishkek')],
      [Markup.button.callback('Алматы / Астана (UTC+5)', 'set_tz_Asia/Almaty')],
      [Markup.button.callback('Ташкент (UTC+5)', 'set_tz_Asia/Tashkent')],
      [Markup.button.callback('⬅️ Назад в меню', 'tz_back')]
    ])
  })
})

// Подменю 2: Москва и СНГ
bot.action('tz_group_moscow', async (ctx) => {
  await ctx.editMessageText('📍 <b>Выбери свой регион:</b>', {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('Москва / Питер (UTC+3)', 'set_tz_Europe/Moscow')],
      [Markup.button.callback('Минск (UTC+3)', 'set_tz_Europe/Minsk')],
      [Markup.button.callback('Баку (UTC+4)', 'set_tz_Asia/Baku')],
      [Markup.button.callback('⬅️ Назад в меню', 'tz_back')]
    ])
  })
})

// Подменю 3: Европа
bot.action('tz_group_europe', async (ctx) => {
  await ctx.editMessageText('📍 <b>Выбери европейское время:</b>', {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('Берлин / Париж / Рим (UTC+1)', 'set_tz_Europe/Berlin')],
      [Markup.button.callback('Киев / Кишинев / Рига (UTC+2)', 'set_tz_Europe/Kiev')],
      [Markup.button.callback('Лондон / Дублин (UTC+0)', 'set_tz_Europe/London')],
      [Markup.button.callback('⬅️ Назад в меню', 'tz_back')]
    ])
  })
})

// Подменю 4: Другие страны
bot.action('tz_group_other', async (ctx) => {
  await ctx.editMessageText('📍 <b>Популярные мировые пояса:</b>', {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('Нью-Йорк / Восточное США (UTC-5)', 'set_tz_America/New_York')],
      [Markup.button.callback('Дубай / ОАЭ (UTC+4)', 'set_tz_Asia/Dubai')],
      [Markup.button.callback('Бангкок / Таиланд (UTC+7)', 'set_tz_Asia/Bangkok')],
      [Markup.button.callback('⬅️ Назад в меню', 'tz_back')]
    ])
  })
})

// Возврат в главное меню поясов
bot.action('tz_back', async (ctx) => {
  await sendTimezoneMenu(ctx, true)
})

// Логика сохранения выбранного пояса с автоматическим удалением меню
bot.action(/^set_tz_(.+)$/, async (ctx) => {
  const selectedTimezone = ctx.match[1]
  const telegramId = ctx.from.id

  try {
    // Сохраняем в сессию
    ctx.session = ctx.session || {}
    ctx.session.timezone = selectedTimezone

    // 💡 ТУТ ТВОЯ ФУНКЦИЯ ОБНОВЛЕНИЯ В БАЗЕ ДАННЫХ
    // Пример: await updateUserInDB(telegramId, { timezone: selectedTimezone });
    console.log(`👤 Пользователь ${telegramId} выбрал таймзону: ${selectedTimezone}`)

    // Убираем анимацию загрузки на кнопке Telegram
    await ctx.answerCbQuery('Время успешно настроено! 🔥')

    // 🔥 УДАЛЯЕМ инлайн-меню из чата, чтобы оно не мозолило глаза
    await ctx.deleteMessage().catch(() => {})

    // Отправляем новое чистое сообщение без кнопок
    await ctx.replyWithHTML(
      '🇺🇸 <b>AMERICAN ENGLISH ACADEMY</b>\n' +
      '───────────────────────\n' +
      '🎯 <b>Часовой пояс успешно сохранен!</b>\n\n' +
      'Майкл зафиксировал твое локальное время. Выбранная зона: <code>' + selectedTimezone + '</code>.\n\n' +
      'Теперь уроки и напоминалки (07:00, 13:00, 22:00) будут приходить строго по твоему будильнику! 👌'
    )
  } catch (err) {
    console.error('Ошибка при сохранении таймзоны в БД:', err)
    await ctx.answerCbQuery('Произошла ошибка базы данных.')
  }
})


const express = require('express')
const app = express()
const PORT = process.env.PORT || 3000

// 🔥 ВАЖНО: Добавили парсер для обработки входящих JSON-пакетов от Telegram
app.use(express.json())

// Создаем простейший роут для проверки живой ли бот
app.get('/', (req, res) => {
  res.send("🤖 Michael's Academy is alive and running 24/7!")
})

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
async function sendLongMessage(ctx, text, keyboard = null) {
  const LIMIT = 4000
  if (text.length <= LIMIT) return ctx.replyWithHTML(text, keyboard)

  const lines = text.split('\n')
  let currentChunk = ''

  for (const line of lines) {
    if ((currentChunk + line).length > LIMIT) {
      await ctx.replyWithHTML(currentChunk)
      currentChunk = ''
    }
    currentChunk += line + '\n'
  }

  if (currentChunk.trim().length > 0) {
    return ctx.replyWithHTML(currentChunk, keyboard)
  }
}

// --- ОБРАБОТКА ТЕКСТА ДОМАШКИ ---
bot.on('text', async ctx => {
  ctx.session = ctx.session || {}

  // 🔥 СТИЛИЗОВАЛИ ЗАГЛУШКУ ПОД ОБЩИЙ ДИЗАЙН АКАДЕМИИ
  if (!ctx.session.waitingForHomework) {
    return ctx.replyWithHTML(
      '🤖 <b>AMERICAN ENGLISH ACADEMY</b>\n' +
        '───────────────────────\n' +
        'Привет, bro! Чтобы отправить текст на проверку ИИ-преподавателю, сначала нажми на кнопку <b>«📝 Сдать домашку»</b> в главном меню или введи команду /start.',
    )
  }

  const userHomework = ctx.message.text
  const currentTopic = ctx.session.currentTopic || 'Общая грамматика'
  const currentDay = ctx.session.currentDay || 1

  ctx.session.waitingForHomework = false

  const waitingMsg = await ctx.reply(
    '🔄 ИИ-Учитель внимательно читает твой текст и сверяет с темой урока... Секундочку...',
  )

  try {
const prompt = `
Ты — Майкл, харизматичный преподаватель американского английского с 40-летним опытом. 
Твой стиль — это дружеский, поддерживающий вайб ("Hey bro!", "Easy peasy!"). Ты объясняешь всё на живом, понятном русском языке, как будто сидишь с другом за чашкой кофе.

Твоя задача — проверить домашнюю работу и дать МЕГА-РАЗБОР.
Тема: "${currentTopic}" (День: ${currentDay})
Текст студента: "${userHomework}"

Твой ответ должен быть максимально полезным. Используй эту структуру:

❌ <b>РАБОТА НАД ОШИБКАМИ:</b>
[Выпиши ошибки и объясни на русском, ПОЧЕМУ это ошибка. Будь честным, но поддерживающим, как настоящий наставник.]

📝 <b>ИДЕАЛЬНАЯ ВЕРСИЯ:</b>
<code>[Напиши исправленный вариант текста, как это сказал бы американец]</code>

💡 <b>ПОЧЕМУ ТАК? (Логика Майкла):</b>
[Объясни тонкости темы "${currentTopic}". Почему американцы строят предложения именно так? Какие есть нюансы или "подводные камни"?]

🚀 <b>ПРАКТИКА И СЛЕНГ:</b>
[Дай 5 примеров того, как эта грамматика используется в реальном уличном сленге США, с переводом.]

🎯 <b>ДОП. ЗАДАНИЕ ДЛЯ ЗАКРЕПЛЕНИЯ:</b>
[Дай одно креативное задание на эту тему, которое заставит студента подумать.]

🌟 <b>СОВЕТ ОТ МАЙКЛА:</b>
[Короткая мотивация. Похвали за старание и дай совет, как звучать увереннее.]

⚠️ ЖЕСТКИЕ ПРАВИЛА:
1. НИКАКОГО Markdown (никаких **, #, ). ИСПОЛЬЗУЙ ТОЛЬКО HTML: <b>, <code>, <i>.
2. Текст должен быть объёмным и глубоким! Разжёвывай каждую деталь.
`;

    // 🔥 ЗАМЕНИЛИ СТАРЫЙ ВЫЗОВ НА НАШ СЕРВИС С АВТОПОВТОРАМИ И КЛЮЧАМИ
    const response = await generateContentWithRetry({
      model: 'gemini-2.0-flash',
      contents: prompt,
    }, 3, 2500) // 3 попытки, задержка 2.5 сек при сетевых сбоях или 429 лимите

    let aiReview = response.text
    
    // Очищаем от возможных обратных кавычек ```html, которые иногда генерирует Flash модель
    aiReview = aiReview
      .replace(/^```html?\s*/i, '')
      .replace(/```\s*$/, '')

    await ctx.telegram
      .deleteMessage(ctx.chat.id, waitingMsg.message_id)
      .catch(() => {})

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📖 Урок дня', 'action_today'),
        Markup.button.callback('⬅️ В меню', 'action_main_menu'),
      ],
    ])

    const fullHeaderText =
      '🇺🇸 <b>AMERICAN ENGLISH ACADEMY</b> 🎓\n' +
      '⚡ <i>Hey bro! Твой личный разбор уже готов!</i>\n' +
      '───────────────────────\n' +
      '🎯 <b>Topic:</b> <code>' + currentTopic + ' (Day ' + currentDay + ')</code>\n' +
      '👨‍🏫 <b>Teacher:</b> <i>Michael (40 years experience)</i>\n' +
      '───────────────────────\n\n' +
      aiReview

    await sendLongMessage(ctx, fullHeaderText, keyboard)
  } catch (error) {
    console.error(
      '❌ Ошибка при проверке задания через Gemini:',
      error.message || error,
    )
    await ctx.telegram
      .deleteMessage(ctx.chat.id, waitingMsg.message_id)
      .catch(() => {})

    // Эта обработка сработает только если исчерпались вообще ВСЕ ключи из пула в aiService
    if (
      error.status === 429 ||
      (error.message && error.message.includes('429'))
    ) {
      return await ctx.replyWithHTML(
        '⚠️ <b>Слишком много домашек!</b>\n\n' +
          'Бро, ИИ-учитель проверяет задания со скоростью света, но Google временно приостановил нас из-за лимита запросов.\n\n' +
          '⏳ <i>Подожди минутку и нажми кнопку ниже, чтобы отправить текст заново.</i>',
        Markup.inlineKeyboard([
          [Markup.button.callback('📝 Сдать домашку', 'action_task')],
          [Markup.button.callback('⬅️ В меню', 'action_main_menu')],
        ]),
      )
    }

    await ctx.reply(
      '⚠️ Сервер ИИ временно задумался или произошла непредвиденная ошибка. Попробуй немного позже.',
      Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ В меню', 'action_main_menu')],
      ]),
    )
  }
})


function startBot() {
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL

  if (RENDER_URL) {
    const secretPath = `/telegraf/${bot.secretPathComponent()}`

    app.use(bot.webhookCallback(secretPath))

    app.listen(PORT, async () => {
      console.log(`✅ Веб-сервер запущен на Render. Слушаем порт: ${PORT}`)
      try {
        await bot.telegram.setWebhook(`${RENDER_URL}${secretPath}`)
        console.log('🚀 [English Master Bot] успешно запущен через WEBHOOK!')
      } catch (err) {
        console.error('❌ Ошибка установки вебхука Telegram:', err.message)
      }
    })
  } else {
    app.listen(PORT, () => {
      console.log(`✅ Локальный веб-сервер запущен на порту: ${PORT}`)
    })

    console.log('⏳ Подключение к Telegram API (Локально)...')
    bot
      .launch()
      .then(() =>
        console.log('🚀 [English Master Bot] успешно запущен локально!'),
      )
      .catch(err => {
        console.error('❌ Ошибка запуска бота:', err.message)
        setTimeout(startBot, 10000)
      })
  }
}

// Запускаем единую точку входа
startBot()

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))