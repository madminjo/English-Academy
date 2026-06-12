const { getUser } = require("../services/userService");
const { Markup } = require("telegraf");

module.exports = (bot) => {
  const showProfile = async (ctx) => {
    // Если это инлайн-кнопка, гасим часики анимации загрузки
    if (ctx.callbackQuery) await ctx.answerCbQuery();

    const user = await getUser(ctx.from.id);
    if (!user) {
      return ctx.reply("💥 Сначала активируйте бота с помощью команды /start");
    }

    // Рендерим красивый прогресс-бар на основе XP пользователя
    const currentXp = user.xp || 0;
    const nextLevelXp = 100; // Порог для примера
    const xpPercent = Math.min(Math.round((currentXp / nextLevelXp) * 10), 10);
    const progressBar = "🟩".repeat(xpPercent) + "⬜".repeat(10 - xpPercent);

    const profileText = 
      `👤 <b>ЛИЧНЫЙ КАБИНЕТ</b>\n` +
      `───────────────────────\n` +
      `🎒 <b>Студент:</b> ${ctx.from.first_name}\n` +
      `📶 <b>Текущий уровень:</b> <code>${user.level || 'A1'}</code>\n` +
      `📅 <b>День обучения:</b> <code>${user.current_day || 1}</code>\n\n` +
      `🏆 <b>Прогресс до следующего уровня:</b>\n` +
      `[${progressBar}] ${currentXp} / ${nextLevelXp} XP`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback("⬅️ В главное меню", "action_main_menu")]
    ]);

    if (ctx.callbackQuery) {
      await ctx.editMessageText(profileText, { parse_mode: "HTML", reply_markup: keyboard.reply_markup });
    } else {
      await ctx.replyWithHTML(profileText, keyboard);
    }
  };

  bot.command("profile", showProfile);
  bot.action("action_profile", showProfile);
};