const { Markup } = require("telegraf");
const topics = require("../data/topics");
const { getUserById, updateWordsCount } = require("../services/userService"); // Подключили апдейт слов
const wordService = require("../services/wordService"); // Сервис для работы со словами в БД
const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = "Ты — харизматичный американский преподаватель английского языка по имени Майкл. Ты помогаешь студентам учить реальный разговорный американский английский (включая части тела, бытовые предметы, глаголы и актуальный уличный сленг).";

const getPromptText = (topic) => {
  return `Генерация для темы: "${topic}".\n` +
    `Твоя задача — сгенерировать список ровно из 100 самых ходовых АМЕРИКАНСКИХ слов и выражений.\n\n` +
    `ОБЯЗАТЕЛЬНО после 50-го слова поставь маркер [SPLIT] на отдельной строке, чтобы разделить текст ровно пополам для лимитов Telegram.\n\n` +
    `Выдавай ответ СТРОГО в следующем формате без markdown блоков:\n\n` +
    `📊 <b>АМЕРИКАНСКИЙ СЛОВАРЬ (Слова 1-50):</b>\n` +
    `1. <b>[слово]</b> — [перевод] ([транскрипция])\n` +
    `... до 50\n\n` +
    `[SPLIT]\n\n` +
    `📊 <b>АМЕРИКАНСКИЙ СЛОВАРЬ (Слова 51-100):</b>\n` +
    `51. <b>[слово]</b> — [перевод] ([транскрипция])\n` +
    `... до 100\n\n` +
    `⚠️ СТРОЖАЙШИЕ ПРАВИЛА РАЗМЕТКИ:\n` +
    `- Разрешено использовать ТОЛЬКО три тега: <b>, <i>, <code>.\n` +
    `- Категорически ЗАПРЕЩЕНО использовать Markdown (никаких **, #, \`).\n` +
    `- Категорически ЗАПРЕЩЕНО использовать теги списков <ul>, <ol>, <li>. Пиши цифры руками.\n` +
    `- Пиши kompaktno, без лишней воды.`;
};

module.exports = (bot) => {
  bot.action("action_words", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    
    if (!ctx.session) ctx.session = {};
    
    let currentTopic = ctx.session.currentTopic;
    let currentDay = ctx.session.currentDay || 1;

    if (!currentTopic) {
      try {
        const user = await getUserById(ctx.from.id);
        if (user && user.current_day) {
          currentDay = user.current_day;
          currentTopic = topics.getTopicById(currentDay);
        }
      } catch (err) {
        console.error("Ошибка получения темы для слов:", err.message);
      }
    }
    
    currentTopic = currentTopic || "Daily American English";

    await ctx.editMessageText(
      `⏳ <b>Майкл проверяет архивы и собирает пак из 100 слов...</b>\n\n` +
      `Тема: <code>День ${currentDay} — ${currentTopic}</code>\n\n` +
      `<i>Если тема уже изучалась кем-то, загрузим мгновенно!</i>`, 
      { parse_mode: "HTML" }
    ).catch(() => {});

    try {
      let rawText = "";

      // 🔥 1. ИЩЕМ ТЕМУ В ГЛОБАЛЬНОМ КЭШЕ БАЗЫ ДАННЫХ
      const cachedWords = await wordService.getWordsByTopic(currentTopic);

      if (cachedWords) {
        rawText = cachedWords;
      } else {
        // Если в кэше БД пусто — делаем запрос к Gemini ИИ
        const response = await ai.models.generateContent({
          model: "gemini-2.0-flash", 
          contents: getPromptText(currentTopic),
          config: {
            systemInstruction: SYSTEM_INSTRUCTION
          }
        });

        rawText = response.text;
        
        rawText = rawText
          .replace(/^```html?\s*/i, "")
          .replace(/```\s*$/, "")
          .replace(/<\/?ul>/gi, "")
          .replace(/<\/?ol>/gi, "")
          .replace(/<li>/gi, "• ")
          .replace(/<\/li>/gi, "\n");

        // 🔥 2. СОХРАНЯЕМ В КЭШ ТАБЛИЦЫ topic_words_cache ДЛЯ ПОСЛЕДУЮЩИХ ЮЗЕРОВ
        await wordService.saveWordsToCache(currentTopic, rawText);
      }

      const parts = rawText.split("[SPLIT]");
      const partOne = parts[0] ? parts[0].trim() : "Не удалось сгенерировать первую часть слов.";
      const partTwo = parts[1] ? parts[1].trim() : "Не удалось сгенерировать вторую часть слов.";

      // Сохраняем в сессию только временный черновик для подтверждения сохранения
      ctx.session.generatedWords = rawText;

      const firstMessage = 
        `🇺🇸 <b>MEGA VOCABULARY PACK (Часть 1/2)</b>\n` +
        `───────────────────────\n` +
        `🎯 <b>Тема:</b> <code>День ${currentDay} — ${currentTopic}</code>\n` +
        `───────────────────────\n\n` +
        `${partOne}`;

      await ctx.replyWithHTML(firstMessage);

      const secondMessage = 
        `🇺🇸 <b>MEGA VOCABULARY PACK (Часть 2/2)</b>\n` +
        `───────────────────────\n\n` +
        `${partTwo}\n\n` +
        `───────────────────────\n` +
        `💡 <i>Выбери действие на панели ниже:</i>`;

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback("📥 Сохранить все", "action_save_words"),
          Markup.button.callback("❌ Отмена", "action_cancel_words")
        ],
        [
          Markup.button.callback("🗂 Сохраненные слова", "action_my_vocabulary")
        ],
        [Markup.button.callback("⬅️ Назад в меню", "action_main_menu")]
      ]);

      await ctx.replyWithHTML(secondMessage, { reply_markup: keyboard.reply_markup });

    } catch (error) {
      console.error("❌ Ошибка обработки 100 слов:", error.message);
      await ctx.replyWithHTML(
        `⚠️ Не удалось загрузить мега-пак слов. Давай попробуем еще раз, bro!`, 
        { reply_markup: Markup.inlineKeyboard([[Markup.button.callback("⬅️ Назад в меню", "action_main_menu")]]).reply_markup }
      ).catch(() => {});
    }
  });

  // ОБРАБОТЧИК КНОПКИ "СОХРАНИТЬ ПАК"
  bot.action("action_save_words", async (ctx) => {
    if (!ctx.session) ctx.session = {};
    const wordsToSave = ctx.session.generatedWords;

    if (!wordsToSave) {
      return ctx.answerCbQuery("⚠️ Данные устарели. Перегенерируй пак!", { show_alert: true });
    }

    try {
      // Парсим текст, оставляя только чистые строки без цифр нумерации ИИ
      const cleanWords = wordsToSave
        .split("\n")
        .map(line => line.trim())
        .filter(line => line && /^\d+\./.test(line))
        .map(line => line.replace(/^\d+\.\s*/, "")); // Срезаем цифры списка вроде "1. "

      if (cleanWords.length === 0) {
        return ctx.answerCbQuery("⚠️ Не удалось отформатировать слова.", { show_alert: true });
      }

      // 🔥 1. Сохраняем массив чистых слов в Postgres личного словаря
      await wordService.saveUserVocabulary(ctx.from.id, cleanWords);
      
      // 🔥 2. Обновляем глобальный счётчик слов (words_learned) в таблице users
      await updateWordsCount(ctx.from.id, cleanWords.length);

      // Сбрасываем кэш временного черновика
      ctx.session.generatedWords = null;

      await ctx.answerCbQuery(`📥 Успешно! +${cleanWords.length} слов добавлено в твой личный профиль!`, { show_alert: true });
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("🗂 Открыть мой словарь", "action_my_vocabulary")],
        [Markup.button.callback("⬅️ Назад в главное меню", "action_main_menu")]
      ]);
      await ctx.editMessageReplyMarkup(keyboard.reply_markup).catch(() => {});

    } catch (err) {
      console.error("Ошибка при сохранении слов в БД:", err.message);
      await ctx.answerCbQuery("⚠️ Ошибка базы данных при сохранении.", { show_alert: true });
    }
  });

  // ОБРАБОТЧИК КНОПКИ "ОТМЕНА"
  bot.action("action_cancel_words", async (ctx) => {
    if (!ctx.session) ctx.session = {};
    
    ctx.session.generatedWords = null; // Стираем только временный черновик
    
    await ctx.answerCbQuery("❌ Действие отменено", { show_alert: false });
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback("🔄 Создать слова заново", "action_words"),
        Markup.button.callback("🗂 Сохраненные слова", "action_my_vocabulary")
      ],
      [Markup.button.callback("⬅️ Назад в главное меню", "action_main_menu")]
    ]);
    
    await ctx.editMessageReplyMarkup(keyboard.reply_markup).catch(() => {});
  });
};