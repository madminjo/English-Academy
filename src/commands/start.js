const { createUser, getUserLanguage } = require("../services/userService");
const { Markup } = require("telegraf");

module.exports = (bot) => {
  bot.start(async (ctx) => {
    // 1. Создаем юзера и сразу берем его язык (или дефолтный)
    await createUser(ctx.from);
    const lang = await getUserLanguage(ctx.from.id);
    ctx.session.lang = lang; // Сохраняем в сессию для быстрого доступа

    // 2. Адаптивный текст приветствия
    const isDe = lang === 'de';
    const title = isDe ? "🎓 DEUTSCHE SPRACHAKADEMIE" : "🎓 AMERICAN ENGLISH ACADEMY";
    const welcome = isDe ? "Hallo! Willkommen im Club!🇩🇪" : "Hey bro! Welcome to the club!🇺🇸";
    
    const htmlMessage = 
      `<b>${title}</b>\n` +
      `───────────────────────\n` +
      `<i>${welcome}</i> 👋\n\n` +
      `Меня зовут <b>Майкл</b>, твой ИИ-преподаватель. Забудь про скучную зубрежку! 🥳\n\n` +
      `🤖 <b>Твой интерактивный тренажер:</b>\n` +
      `• Каждый день в <b>07:00</b> я пришлю урок.\n` +
      `• Отправляй домашку на проверку.\n\n` +
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
        ],
        [
          Markup.button.callback("💡 Как это работает?", "action_help")
        ]
      ])
    );
  });

  // Добавь обработчик для новой кнопки помощи
  bot.action("action_help", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.replyWithHTML(
      "<b>Как учиться с Майклом:</b>\n\n" +
      "1. <b>Уроки:</b> Я присылаю контент ежедневно.\n" +
      "2. <b>Домашка:</b> Просто напиши текст в ответ на запрос.\n" +
      "3. <b>Прогресс:</b> Проверяй профиль, чтобы следить за стрик-днями.\n\n" +
      "<i>Есть вопросы? Пиши @admin_username</i>"
    );
  });
};