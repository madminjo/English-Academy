const { Markup } = require('telegraf')
const { getUserById, updateWordsCount, canUseFeature, incrementFeature } = require('../services/userService')
const wordService = require('../services/wordService')
const { generateContentWithRetry } = require('../services/aiService')
const { sanitizeForTelegram } = require('../utils/textFormatter')


// Динамически определяем, какие темы грузить, чтобы узнать название урока по ID
const getTopicsByLang = lang =>
  lang === 'de' 
    ? require('../data/german_topics').topics 
    : require('../data/topics').topics

// Функция генерации промпта в зависимости от языка
const getPromptText = (topic, lang) => {
  const isGerman = lang === 'de'
  const header = isGerman
    ? '📊 DEUTSCHER WORT-SCHATZ (30 wichtige Wörter):'
    : '📊 АМЕРИКАНСКИЙ СЛОВАРЬ (30 самых важных слов):'

  return `Ты — Майкл, преподаватель ${isGerman ? 'немецкого' : 'американского английского'}. Составь список из 30 самых важных слов по теме: "${topic}".

ВАЖНО: 
- Слово и транскрипция — на изучаемом языке (${isGerman ? 'немецком' : 'английском'}).
- Перевод и комментарий "Майкл:" — ТОЛЬКО на русском языке, простым разговорным стилем, без канцелярита.
- Не используй markdown-разметку (никаких **, #, \`\`\`html и т.п.) — только обычный текст и эмодзи.

Формат строго такой:
1. Слово — Перевод (Транскрипция)
Майкл: Короткий живой комментарий на русском (как использовать, нюанс значения, пример).

Заголовок перед списком: ${header}`
}

module.exports = bot => {
  bot.action(/^action_words(:force)?$/, async ctx => {
    const isForceUpdate = ctx.match[1] === ':force'
    await ctx.answerCbQuery().catch(() => {})

    const allowed = await canUseFeature(ctx.from.id, 'words')
    if (!allowed) {
      return ctx.reply(
        '⚠️ Лимит генерации слов исчерпан (3 в сутки). Лимит обновится через 24 часа, либо оформи подписку 🚀',
      )
    }
    await incrementFeature(ctx.from.id, 'words')

    if (!ctx.session) ctx.session = {}
    const lang = ctx.session.lang || 'en'
    
    // --- СИНХРОНИЗАЦИЯ ТЕМЫ С TODAY.JS ---
    let currentDay = 1
    let currentTopic = lang === 'de' ? 'Deutsch lernen' : 'Daily American English'

    try {
      const user = await getUserById(ctx.from.id)
      if (user?.current_day) {
        currentDay = user.current_day
      }
      
      const topicsObj = getTopicsByLang(lang)
      const allTopics = Object.values(topicsObj).flat()
      const found = allTopics.find(t => t.id === currentDay)
      if (found) {
        currentTopic = found.title
      }
    } catch (err) {
      console.error('Ошибка получения темы в словах:', err.message)
    }
    // -------------------------------------

    const statusMsg = await ctx.reply('⏳ <b>Майкл собирает пак слов...</b>', {
      parse_mode: 'HTML',
    })

    try {
      let rawText = ''
      // Кэшируем по топику + языку
      const cacheKey = `${lang}_day_${currentDay}` // Надёжнее привязать к ID дня, чтобы избежать проблем со спецсимволами в названии темы
      const cachedWords = isForceUpdate
        ? null
        : await wordService.getWordsByTopic(cacheKey)

      if (cachedWords) {
        rawText = cachedWords
      } else {
        const response = await generateContentWithRetry(
          {
            model: 'gemini-2.0-flash',
            contents: getPromptText(currentTopic, lang),
          },
          4,
          3000,
        )

        if (!response?.text) throw new Error('Пустой ответ от ИИ')

        rawText = sanitizeForTelegram(response.text)
        await wordService.saveWordsToCache(cacheKey, rawText)
      }

      ctx.session.generatedWords = rawText

      const title = lang === 'de' ? 'MEGA WORT-PAKET' : 'MEGA VOCABULARY PACK'
      const finalMessage =
        `🎓 <b>${title}</b>\n` +
        `───────────────────────\n` +
        `🎯 <b>Тема:</b> <code>День ${currentDay} — ${currentTopic}</code>\n` +
        `───────────────────────\n\n` +
        rawText +
        `\n\n` +
        `───────────────────────\n` +
        `💡 <i>Выбери действие:</i>`

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('📥 Сохранить', 'action_save_words'),
          Markup.button.callback('🔄 Обновить', 'action_words:force'),
        ],
        [Markup.button.callback('❌ Отмена', 'action_cancel_words')],
        [Markup.button.callback('⬅️ Назад в меню', 'action_main_menu')],
      ])

      if (statusMsg) {
        await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {})
      }
      
      await ctx.replyWithHTML(finalMessage, {
        reply_markup: keyboard.reply_markup,
      })
    } catch (error) {
      console.error('❌ ОШИБКА:', error)
      if (statusMsg) {
        await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {})
      }
      await ctx.reply('⚠️ Не удалось собрать пак. Бро, попробуй еще раз!')
    }
  })
  

  bot.action('action_save_words', async ctx => {
    const wordsToSave = ctx.session.generatedWords
    if (!wordsToSave)
      return ctx.answerCbQuery('⚠️ Данные устарели!', { show_alert: true })

    try {
      const lines = wordsToSave.split('\n').filter(l => /^\d+\./.test(l))
      const cleanWords = lines.map(line => {
        const withoutNum = line.replace(/^\d+\.\s*/, '')
        const [wordPart, rest] = withoutNum.split('—').map(s => s.trim())
        const transMatch = rest
          ? rest.match(/^(.*?)(?:\s*\(([^)]+)\))?$/)
          : null
        return {
          word: wordPart || '',
          translation: transMatch?.[1]?.trim() || '',
          transcription: transMatch?.[2]?.trim() || '',
        }
      })

      await wordService.saveUserVocabulary(ctx.from.id, cleanWords)
      await updateWordsCount(ctx.from.id, cleanWords.length)
      ctx.session.generatedWords = null

      await ctx.answerCbQuery('📥 Успешно добавлено!', { show_alert: true })
      await ctx
        .editMessageReplyMarkup(
          Markup.inlineKeyboard([
            [Markup.button.callback('⬅️ В главное меню', 'action_main_menu')],
          ]).reply_markup,
        )
        .catch(() => {})
    } catch (err) {
      await ctx.answerCbQuery('⚠️ Ошибка сохранения', { show_alert: true })
    }
  })

  bot.action('action_cancel_words', async ctx => {
    ctx.session.generatedWords = null
    await ctx.answerCbQuery('❌ Отменено')
    await ctx
      .editMessageReplyMarkup(
        Markup.inlineKeyboard([
          [Markup.button.callback('⬅️ В главное меню', 'action_main_menu')],
        ]).reply_markup,
      )
      .catch(() => {})
  })
}