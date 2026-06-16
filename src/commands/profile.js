const { Markup } = require('telegraf');
const { getUserById } = require('../services/userService');

module.exports = (bot) => {
  bot.action('action_profile', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    
    const user = await getUserById(ctx.from.id);
    if (!user) return ctx.reply("❌ Ошибка: пользователь не найден.");

    // Перевод статуса для красоты
    const statusNames = {
      'free': 'Стандарт (Free)',
      'mo1': 'Месяц (Premium)',
      'mo3': '3 месяца (Premium)',
      'mo6': '6 месяцев (Premium)',
      'mo12': 'Год (Premium)'
    };

    const subText = user.status === 'free' 
      ? "<i>Нет активной подписки</i>" 
      : `✅ Активна до: <b>${user.sub_end_date ? new Date(user.sub_end_date).toLocaleDateString() : '—'}</b>`;

    const profileText = 
      `👤 <b>ЛИЧНЫЙ КАБИНЕТ СТУДЕНТА</b>\n` +
      `───────────────────────\n` +
      `🆔 <b>ID:</b> <code>${user.telegram_id}</code>\n` +
      `🎓 <b>Имя:</b> ${user.first_name || 'Студент'}\n` +
      `📅 <b>Текущий день:</b> ${user.current_day || 1}\n` +
      `📚 <b>Выучено слов:</b> ${user.words_learned || 0}\n` +
      `💎 <b>Статус:</b> ${statusNames[user.status] || 'Free'}\n` +
      `🔔 <b>Подписка:</b> ${subText}\n` +
      `───────────────────────`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('⬅️ В главное меню', 'action_main_menu')]
    ]);

    await ctx.editMessageText(profileText, { parse_mode: 'HTML', ...keyboard });
  });
};