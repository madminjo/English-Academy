const { isSubActive } = require("../services/userService");

async function subscriptionGuard(ctx, next) {
  const ADMIN_ID = 5037778442;

  // 1. Всегда пропускаем админа
  if (ctx.from.id === ADMIN_ID) return next();

  // 2. Разрешаем /start (команда) или callback "start" (если есть)
  const isStartCommand = ctx.message?.text === '/start';
  const isStartCallback = ctx.callbackQuery?.data === 'action_start'; // Если есть такой action
  
  if (isStartCommand || isStartCallback) return next();

  // 3. Проверка подписки
  try {
    const active = await isSubActive(ctx.from.id);
    
    if (!active) {
      // Для callback-кнопок важно отвечать, иначе кнопка будет "висеть" с часиками
      if (ctx.callbackQuery) {
        await ctx.answerCbQuery('⚠️ Подписка неактивна!', { show_alert: true });
        return; 
      }
      return ctx.reply("⚠️ <b>Доступ ограничен!</b>\nВаша подписка истекла или отсутствует. Свяжитесь с админом для продления.", { parse_mode: 'HTML' });
    }
  } catch (err) {
    console.error("Ошибка в subscriptionGuard:", err);
    return ctx.reply("⚠️ Ошибка сервера. Попробуйте позже.");
  }
  
  return next();
}

module.exports = { subscriptionGuard };