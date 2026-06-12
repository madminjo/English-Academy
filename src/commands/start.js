const { createUser } = require("../services/userService");
const { Markup } = require("telegraf");

module.exports = (bot) => {
  bot.start(async (ctx) => {
    try {
      // Сохраняем пользователя в PostgreSQL (Neon)
      await createUser(ctx.from);
    } catch (error) {
      console.error("Ошибка при создании пользователя:", error);
    }

    // Крутой, кастомный вайб от Майкла прямо на старте
    const htmlMessage = 
      `🎓 <b>AMERICAN ENGLISH ACADEMY</b>\n` +
      `───────────────────────\n` +
      `🇺🇸 <i>Hey bro! Welcome to the club!</i> 👋\n` +
      `<b>(Эй, бро! Добро пожаловать в клуб!)</b>\n\n` +
      `Меня зовут <b>Майкл</b>, я твой личный ИИ-преподаватель с 40-летним опытом. Забудь про скучную зубрежку и занудные термины! Мы будем учить английский просто, весело и на пальцах. 🥳\n\n` +
      `🤖 <b>Твой интерактивный тренажер готов:</b>\n` +
      `• Каждый день в <b>07:00</b> я буду присылать тебе уникальный ИИ-урок.\n` +
      `• Ты сможешь отправлять мне домашку прямо в чат на проверку.\n` +
      `• Я разберу каждую твою ошибку на понятном русском языке!\n\n` +
      `👇 <b>Ready? Let's do it! Выбирай действие на панели:</b>`;

    await ctx.replyWithHTML(
      htmlMessage,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("📖 Урок дня", "action_today"),
          Markup.button.callback("📚 Слова дня", "action_words")
        ],
        [
          Markup.button.callback("📝 Задание", "action_task"),
          Markup.button.callback("🏆 Прогресс", "action_profile")
        ],
        [
          Markup.button.callback("🎯 Выбрать урок", "action_lessons"),
          Markup.button.callback("🔔 Напоминания", "action_reminders")
        ]
      ])
    );
  });
};