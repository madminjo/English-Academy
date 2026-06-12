const { Markup } = require("telegraf");

module.exports = (bot) => {
  bot.action("action_main_menu", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    
    ctx.session = ctx.session || {};
    ctx.session.waitingForHomework = false;

    const htmlMessage = 
      `🇺🇸 <b>AMERICAN ENGLISH ACADEMY</b>\n` +
      `───────────────────────\n` +
      `Welcome back, <b>${ctx.from.first_name || 'student'}</b>! 👋\n\n` +
      `🤖 <b>Твой ИИ-тренажер активен и готов к работе.</b>\n` +
      `Выбирай нужный раздел на панели управления ниже, чтобы продолжить прокачку языка:\n` +
      `───────────────────────`;

    await ctx.editMessageText(htmlMessage, {
      parse_mode: "HTML",
      reply_markup: Markup.inlineKeyboard([
        // Первый ряд: Обучение
        [
          Markup.button.callback("📖 Урок дня", "action_today"),
          Markup.button.callback("📚 Слова дня", "action_words")
        ],
        // Второй ряд: Личный архив слов и сдача ДЗ
        [
          Markup.button.callback("🗂 Мой словарь", "action_my_vocabulary"), // 🔥 НАША НОВАЯ КНОПКА
          Markup.button.callback("📝 Сдать домашку", "action_task")
        ],
        // Третий ряд: Прогресс и трекинг
        [
          Markup.button.callback("🏆 Прогресс & Стрики", "action_profile"),
          Markup.button.callback("🎯 Выбор уровня", "action_lessons")
        ],
        // Четвертый ряд: Настройки
        [
          Markup.button.callback("🔔 Напоминания", "action_reminders")
        ]
      ]).reply_markup
    }).catch((err) => console.log("Текст не изменился, игнорируем"));
  });
};