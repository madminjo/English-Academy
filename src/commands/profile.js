const { getUser } = require('../services/userService');
const { Markup } = require('telegraf');

module.exports = (bot) => {
  bot.command('profile', async (ctx) => {
    try {
      const user = await getUser(ctx.from.id);
      if (!user) return ctx.reply("Сначала нажми /start, чтобы зарегистрироваться!");

      const profileText = `
👤 <b>Твой профиль:</b>
───────────────────────
🆔 <b>ID:</b> ${user.telegram_id}
📛 <b>Имя:</b> ${user.first_name || '—'}
👑 <b>Статус:</b> ${user.status === 'premium' ? '💎 Premium' : '🆓 Free'}
📅 <b>Подписка до:</b> ${user.sub_end_date ? new Date(user.sub_end_date).toLocaleDateString() : '—'}
📈 <b>Уровень:</b> ${user.level}
🔥 <b>Стрик:</b> ${user.streak} дней
🧠 <b>Выучено слов:</b> ${user.words_learned}
`;

      await ctx.replyWithHTML(profileText, Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ В меню', 'action_main_menu')]
      ]));
    } catch (error) {
      console.error("Ошибка в /profile:", error);
      ctx.reply("⚠️ Не удалось загрузить профиль. Попробуй позже.");
    }
  });
};