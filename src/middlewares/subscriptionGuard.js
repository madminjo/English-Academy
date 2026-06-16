const { isSubActive, canRequest } = require("../services/userService");

async function subscriptionGuard(ctx, next) {
  const ADMIN_ID = 5037778442;

  // 1. Всегда пропускаем админа
  if (ctx.from.id === ADMIN_ID) return next();

  // 2. Разрешаем /start
  const isStartCommand = ctx.message?.text === '/start';
  const isStartCallback = ctx.callbackQuery?.data === 'action_start';
  
  if (isStartCommand || isStartCallback) return next();

  // 3. ПРОВЕРКА ДОСТУПА
  try {
    // Проверяем: есть ли премиум ИЛИ проходит ли юзер по лимитам бесплатного периода
    const active = await isSubActive(ctx.from.id);
    const hasFreeAccess = await canRequest(ctx.from.id);
    
    if (!active && !hasFreeAccess) {
      if (ctx.callbackQuery) {
        await ctx.answerCbQuery('⚠️ Доступ ограничен! Подписка или пробный период истекли.', { show_alert: true });
        return; 
      }
      return ctx.reply("⚠️ <b>Доступ ограничен!</b>\nВаша подписка истекла, а пробный период в 5 дней закончился. Свяжитесь с админом для продления.", { parse_mode: 'HTML' });
    }
  } catch (err) {
    console.error("Ошибка в subscriptionGuard:", err);
    return ctx.reply("⚠️ Ошибка сервера. Попробуйте позже.");
  }
  
  return next();
}

module.exports = { subscriptionGuard };