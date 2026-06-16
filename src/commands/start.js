const { createUser, getUserLanguage } = require("../services/userService");
const { Markup } = require("telegraf");

module.exports = (bot) => {
  bot.start(async (ctx) => {
    // 1. БЕЗОПАСНАЯ ИНИЦИАЛИЗАЦИЯ СЕССИИ
    // Даже если middleware не успел создать сессию, мы делаем это сами
    ctx.session = ctx.session || {};

    try {
      // 2. Создаем юзера
      await createUser(ctx.from);
      
      // 3. Берем язык с обработкой ошибки
      const lang = await getUserLanguage(ctx.from.id).catch(() => 'en');
      ctx.session.lang = lang || 'en';

      // 4. Адаптивный текст приветствия
      const isDe = ctx.session.lang === 'de';
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
    } catch (err) {
      console.error("❌ Ошибка в команде /start:", err);
      await ctx.reply("Упс, бро, что-то пошло не так. Попробуй нажать /start еще раз!");
    }
  });

  bot.action("action_help", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.replyWithHTML(
      "<b>Как учиться с Майклом:</b>\n\n" +
      "1. <b>Уроки:</b> Я присылаю контент ежедневно.\n" +
      "2. <b>Домашка:</b> Просто напиши текст в ответ на запрос.\n" +
      "3. <b>Прогресс:</b> Проверяй профиль, чтобы следить за стрик-днями.\n\n" +
      "<i>Есть вопросы? Пиши админу.</i>"
    );
  });
};