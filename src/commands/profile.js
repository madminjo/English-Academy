const { getUser } = require('../services/userService');
const { Markup } = require('telegraf');

module.exports = (bot) => {
  const getProfileMessage = async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user) return null;

    // Берем язык из сессии (если есть) или из базы
    const lang = ctx.session.lang || user.lang || 'en';
    const langDisplay = lang === 'de' ? '🇩🇪 Deutsch' : '🇬🇧 English';

    const statusDisplay = user.status === 'free' 
      ? '🆓 Free' 
      : `💎 Premium (${user.status.toUpperCase()})`;

    return `
👤 <b>Твой профиль:</b>
───────────────────────
🆔 <b>ID:</b> ${user.telegram_id}
📛 <b>Имя:</b> ${user.first_name || '—'}
👑 <b>Статус:</b> ${statusDisplay}
📅 <b>Подписка до:</b> ${user.sub_end_date ? new Date(user.sub_end_date).toLocaleDateString() : '—'}
📈 <b>Уровень:</b> ${user.level}
🔥 <b>Стрик:</b> ${user.streak} дней
🧠 <b>Выучено слов:</b> ${user.words_learned}
🌍 <b>Язык:</b> ${langDisplay}
`;
  };

  // Клавиатура профиля (вынесли отдельно, чтобы не дублировать)
  const profileKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🌍 Изменить язык', 'action_select_lang')],
    [Markup.button.callback('⬅️ В меню', 'action_main_menu')]
  ]);

  // Обработка команды /profile
  bot.command('profile', async (ctx) => {
    const profileText = await getProfileMessage(ctx);
    if (!profileText) return ctx.reply("Сначала нажми /start!");
    await ctx.replyWithHTML(profileText, profileKeyboard);
  });

  // Обработка кнопки "👤 Профиль"
  bot.action('action_profile', async (ctx) => {
    await ctx.answerCbQuery(); 
    const profileText = await getProfileMessage(ctx);
    if (!profileText) return ctx.answerCbQuery("Сначала нажми /start!");
    
    await ctx.editMessageText(profileText, {
      parse_mode: 'HTML',
      ...profileKeyboard
    });
  });
};