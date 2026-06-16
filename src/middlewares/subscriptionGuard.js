// subscriptionGuard.js
const { isSubActive, canRequest } = require("../services/userService");

async function subscriptionGuard(ctx, next) {
  // ... (проверка админа и прочее)

  const active = await isSubActive(ctx.from.id);
  const hasFreeAccess = await canRequest(ctx.from.id); // Вызываем функцию из сервиса!
  
  if (!active && !hasFreeAccess) {
    const message = `⚠️ <b>Доступ ограничен!</b>\n\n` +
                    `Ваш бесплатный период или лимит запросов исчерпан.\n\n` +
                    `Чтобы продолжить обучение, приобретите подписку.\n` +
                    `По всем вопросам обращайтесь к разработчику: @scrayass`;
    
    if (ctx.callbackQuery) {
      return ctx.answerCbQuery('⚠️ Доступ ограничен!', { show_alert: true });
    }
    return ctx.reply(message, { parse_mode: 'HTML' });
  }
  
  return next();
}