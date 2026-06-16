const { createUser } = require("../services/userService");
const { Markup } = require("telegraf");

module.exports = (bot) => {
  bot.start(async (ctx) => {
    try {
      await createUser(ctx.from);
    } catch (error) {
      console.error("Ошибка при создании пользователя:", error);
    }

    const htmlMessage = 
      `🎓 <b>AMERICAN ENGLISH ACADEMY</b>\n` +
      `───────────────────────\n` +
      `🇺🇸 <i>Hey bro! Welcome to the club!</i> 👋\n\n` +
      `Меня зовут <b>Майкл</b>, твой ИИ-преподаватель. Забудь про скучную зубрежку! 🥳\n\n` +
      `🤖 <b>Твой интерактивный тренажер готов:</b>\n` +
      `• Каждый день в <b>07:00</b> я пришлю урок.\n` +
      `• Отправляй домашку в чат на проверку.\n` +
      `• Я разберу все твои ошибки!\n\n` +
      `👇 <b>Ready? Выбирай действие:</b>`;

    await ctx.replyWithHTML(
      htmlMessage,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("📖 Урок дня", "action_today"),
          Markup.button.callback("📚 Слова дня", "action_words")
        ],
        [
          Markup.button.callback("📝 Сдать домашку", "action_task"),
          Markup.button.callback("👤 Профиль", "action_profile")
        ],
        [
          Markup.button.callback("🎯 Уровни", "action_lessons"),
          Markup.button.callback("⚙️ Настройки времени", "action_settings")
        ]
      ])
    );
  });
};