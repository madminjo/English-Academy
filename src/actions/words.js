const { Markup } = require("telegraf");
const topics = require("../data/topics");
const { getUserById, updateWordsCount } = require("../services/userService"); 
const wordService = require("../services/wordService"); 
const { generateContentWithRetry } = require("../services/aiService");

const SYSTEM_INSTRUCTION = "Ты — харизматичный американский преподаватель английского языка по имени Майкл. Ты помогаешь студентам учить реальный разговорный американский английский (включая части тела, бытовые предметы, глаголы и актуальный уличный сленг).";

const getPromptText = (topic) => {
  return "Генерация для темы: \"" + topic + "\".\n" +
    "Твоя задача — сгенерировать список РОВНО из 30 самых ходовых, сочных АМЕРИКАНСКИХ слов и выражений по этой теме.\n\n" +
    "Выдавай ответ СТРОГО в следующем формате без markdown блоков:\n\n" +
    "📊 <b>АМЕРИКАНСКИЙ СЛОВАРЬ (30 самых важных слов):</b>\n" +
    "1. <b>[слово]</b> — [перевод] ([транскрипция])\n" +
    "2. <b>[слово]</b> — [перевод] ([транскрипция])\n" +
    "... и так далее ровно до 30.\n\n" +
    "⚠️ СТРОЖАЙШИЕ ПРАВИЛА РАЗМЕТКИ:\n" +
    "- Разрешено использовать ТОЛЬКО три тега: <b>, <i>, <code>.\n" +
    "- Категорически ЗАПРЕЩЕНО использовать Markdown (никаких **, #, `). Выделяй слова только тегами <b>.\n" +
    "- Категорически ЗАПРЕЩЕНО использовать теги списков <ul>, <ol>, <li>. Пиши цифры руками.\n" +
    "- Пиши kompaktno, без лишней воды и длинных вступлений.";
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

    // 1. Показываем плашку загрузки
    await ctx.editMessageText(
      "⏳ <b>Майкл проверяет архивы и собирает пак из 30 слов...</b>\n\n" +
      "Тема: <code>День " + currentDay + " — " + currentTopic + "</code>\n\n" +
      "<i>Если тема уже изучалась кем-то, загрузим мгновенно!</i>", 
      { parse_mode: "HTML" }
    ).catch(() => {});

    try {
      let rawText = "";

      // Ищем тему в глобальном кэше базы данных
      const cachedWords = await wordService.getWordsByTopic(currentTopic);

      if (cachedWords) {
        rawText = cachedWords;
      } else {
        // Если в кэше пусто — генерируем через ИИ
        const response = await generateContentWithRetry({
          model: "gemini-2.0-flash", 
          contents: getPromptText(currentTopic),
          config: { systemInstruction: SYSTEM_INSTRUCTION }
        }, 4, 3000); 

        rawText = response.text;
        
        rawText = rawText
          .replace(/^```html?\s*/i, "")
          .replace(/```\s*$/, "")
          .replace(/<\/?ul>/gi, "")
          .replace(/<\/?ol>/gi, "")
          .replace(/<li>/gi, "• ")
          .replace(/<\/li>/gi, "\n");

        // Предохранитель от звёздочек
        rawText = rawText.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

        // Сохраняем в кэш БД для последующих юзеров
        await wordService.saveWordsToCache(currentTopic, rawText);
      }

      // Подстраховка очистки звёздочек для старого кэша
      rawText = rawText.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

      ctx.session.generatedWords = rawText;

      const finalMessage = 
        "🇺🇸 <b>MEGA VOCABULARY PACK</b>\n" +
        "───────────────────────\n" +
        "🎯 <b>Тема:</b> <code>День " + currentDay + " — " + currentTopic + "</code>\n" +
        "───────────────────────\n\n" +
        rawText + "\n\n" +
        "───────────────────────\n" +
        "💡 <i>Выбери действие на панели ниже:</i>";

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

      // 🔥 УДАЛЯЕМ СООБЩЕНИЕ С ЗАГРУЗКОЙ (оно же старое сообщение меню)
      await ctx.deleteMessage().catch(() => {});

      // Отправляем чистый и красивый финальный ответ
      await ctx.replyWithHTML(finalMessage, { reply_markup: keyboard.reply_markup });

    } catch (error) {
      console.error("❌ Ошибка обработки слов через пул ИИ:", error.message);
      
      // 🔥 На случай ошибки тоже удаляем плашку загрузки, чтобы не висела вечно
      await ctx.deleteMessage().catch(() => {});

      await ctx.replyWithHTML(
        "⚠️ Не удалось загрузить мега-пак слов. Давай попробуем еще раз, bro!", 
        { reply_markup: Markup.inlineKeyboard([[Markup.button.callback("⬅️ Назад в меню", "action_main_menu")]]).reply_markup }
      ).catch(() => {});
    }
  });

  // ОБРАБОТЧИК КНОПКИ "СОХРАНИТЬ ПАК"
// ОБРАБОТЧИК КНОПКИ "СОХРАНИТЬ ПАК"
  bot.action("action_save_words", async (ctx) => {
    if (!ctx.session) ctx.session = {};
    const wordsToSave = ctx.session.generatedWords;

    if (!wordsToSave) {
      return ctx.answerCbQuery("⚠️ Данные устарели. Перегенерируй пак!", { show_alert: true });
    }

    try {
      // 1. Разбиваем текст на строки и фильтруем только нумерованные
      const lines = wordsToSave
        .split("\n")
        .map(line => line.trim())
        .filter(line => line && /^\d+\./.test(line));

      const cleanWords = [];

      for (let line of lines) {
        // Убираем нумерацию (например, "1. " или "24. ")
        let cleanLine = line.replace(/^\d+\.\s*/, "");
        
        // Очищаем от HTML тегов <b>, </i>, <code>, чтобы в БД сохранялся чистый текст
        cleanLine = cleanLine.replace(/<\/?[^>]+(>|$)/g, "");

        // Парсим строку формата: "Слово — Перевод (транскрипция)"
        // Разбиваем по длинному или короткому тире
        const parts = cleanLine.split(/—|-/);
        if (parts.length >= 2) {
          const word = parts[0].trim();
          let rest = parts.slice(1).join("—").trim();
          
          // Извлекаем транскрипцию, если она есть в скобках
          let transcription = "";
          const transcriptionMatch = rest.match(/\((.*?)\)/);
          if (transcriptionMatch) {
            transcription = transcriptionMatch[1].trim();
            // Убираем транскрипцию из перевода
            rest = rest.replace(/\s*\(.*?\)\s*/g, "").trim();
          }
          
          const translation = rest;

          // Добавляем структурированный объект в массив
          cleanWords.push({
            word: word,
            translation: translation,
            transcription: transcription
          });
        } else {
          // Если строка не распарсилась по тире, сохраняем её целиком как слово (фоллбэк)
          cleanWords.push({
            word: cleanLine,
            translation: "",
            transcription: ""
          });
        }
      }

      if (cleanWords.length === 0) {
        return ctx.answerCbQuery("⚠️ Не удалось отформатировать слова для базы.", { show_alert: true });
      }

      // 🔥 2. Передаем в сервис структурированный массив
      await wordService.saveUserVocabulary(ctx.from.id, cleanWords);
      
      // Глобальный счётчик изученных слов
      await updateWordsCount(ctx.from.id, cleanWords.length);

      // Сбрасываем кэш сессии
      ctx.session.generatedWords = null;

      await ctx.answerCbQuery("📥 Успешно! +" + cleanWords.length + " слов добавлено в твой личный профиль!", { show_alert: true });
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("🗂 Открыть мой словарь", "action_my_vocabulary")],
        [Markup.button.callback("⬅️ Назад в главное меню", "action_main_menu")]
      ]);
      await ctx.editMessageReplyMarkup(keyboard.reply_markup).catch(() => {});

    } catch (err) {
      console.error("❌ Критическая ошибка при сохранении слов в БД:", err);
      // Выводим реальную ошибку в alert для отладки, если это локальный тест
      await ctx.answerCbQuery("⚠️ Ошибка БД: " + err.message, { show_alert: true });
    }
  });

  // ОБРАБОТЧИК КНОПКИ "ОТМЕНА"
  bot.action("action_cancel_words", async (ctx) => {
    if (!ctx.session) ctx.session = {};
    ctx.session.generatedWords = null; 
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