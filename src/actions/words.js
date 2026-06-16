const { Markup } = require("telegraf");
const topics = require("../data/topics");
const { getUserById, updateWordsCount } = require("../services/userService");
const wordService = require("../services/wordService");
const { generateContentWithRetry } = require("../services/aiService");
const { sanitizeForTelegram } = require("../utils/textFormatter");

const SYSTEM_INSTRUCTION = "Ты — харизматичный американский преподаватель английского языка по имени Майкл. Ты помогаешь студентам учить реальный разговорный американский английский.";

const getPromptText = (topic) => {
  return 'Ты — Майкл. Твоя задача — составить для студента МЕГА-ПАК из 30 самых сочных слов по теме: "' + topic + '".\n' +
    'Формат строго такой:\n' +
    '1. Слово — Перевод (Транскрипция)\n' +
    'Майкл: Сленговый комментарий\n\n' +
    'Правила: Никакого Markdown. Заголовок: 📊 АМЕРИКАНСКИЙ СЛОВАРЬ (30 самых важных слов):';
};

module.exports = (bot) => {
  bot.action("action_words", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    
    if (!ctx.session) ctx.session = {};
    
    let currentTopic = ctx.session.currentTopic || "Daily American English";
    let currentDay = ctx.session.currentDay || 1;

    // Сразу шлем "Загрузку", чтобы пользователь видел реакцию
    const statusMsg = await ctx.reply("⏳ <b>Майкл проверяет архивы и собирает пак...</b>", { parse_mode: "HTML" });

    try {
      let rawText = "";
      const cachedWords = await wordService.getWordsByTopic(currentTopic);

      if (cachedWords) {
        rawText = cachedWords;
      } else {
        const response = await generateContentWithRetry({
          model: "gemini-2.0-flash",
          contents: getPromptText(currentTopic),
          config: { systemInstruction: SYSTEM_INSTRUCTION }
        }, 4, 3000);

        if (!response?.text) throw new Error("Пустой ответ от ИИ");
        
        rawText = sanitizeForTelegram(response.text);
        await wordService.saveWordsToCache(currentTopic, rawText);
      }

      ctx.session.generatedWords = rawText;

      const finalMessage = 
        "🇺🇸 <b>MEGA VOCABULARY PACK</b>\n" +
        "───────────────────────\n" +
        "🎯 <b>Тема:</b> <code>День " + currentDay + " — " + currentTopic + "</code>\n" +
        "───────────────────────\n\n" +
        rawText + "\n\n" +
        "───────────────────────\n" +
        "💡 <i>Выбери действие:</i>";

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("📥 Сохранить всё", "action_save_words"), Markup.button.callback("❌ Отмена", "action_cancel_words")],
        [Markup.button.callback("🗂 Мой словарь", "action_my_vocabulary")],
        [Markup.button.callback("⬅️ Назад в меню", "action_main_menu")]
      ]);

      // Удаляем плашку загрузки и отправляем результат
      await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
      await ctx.replyWithHTML(finalMessage, { reply_markup: keyboard.reply_markup });

    } catch (error) {
      console.error("❌ ОШИБКА:", error);
      await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
      await ctx.reply("⚠️ Не удалось собрать пак. Бро, попробуй еще раз!");
    }
  });

  bot.action("action_save_words", async (ctx) => {
    const wordsToSave = ctx.session.generatedWords;
    if (!wordsToSave) return ctx.answerCbQuery("⚠️ Данные устарели!", { show_alert: true });

    try {
      // Парсим только строки с цифрами
      const lines = wordsToSave.split("\n").filter(l => /^\d+\./.test(l));
      const cleanWords = lines.map(line => ({
        word: line.replace(/^\d+\.\s*/, "").split("—")[0].trim(),
        translation: "",
        transcription: ""
      }));

      await wordService.saveUserVocabulary(ctx.from.id, cleanWords);
      await updateWordsCount(ctx.from.id, cleanWords.length);
      ctx.session.generatedWords = null;

      await ctx.answerCbQuery("📥 Успешно добавлено!", { show_alert: true });
      await ctx.editMessageReplyMarkup(Markup.inlineKeyboard([[Markup.button.callback("⬅️ В главное меню", "action_main_menu")]]).reply_markup).catch(() => {});
    } catch (err) {
      await ctx.answerCbQuery("⚠️ Ошибка сохранения", { show_alert: true });
    }
  });

  bot.action("action_cancel_words", async (ctx) => {
    ctx.session.generatedWords = null;
    await ctx.answerCbQuery("❌ Отменено");
    await ctx.editMessageReplyMarkup(Markup.inlineKeyboard([[Markup.button.callback("⬅️ В главное меню", "action_main_menu")]]).reply_markup).catch(() => {});
  });
};