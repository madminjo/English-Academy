require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const express = require('express');

// Инициализация бота
const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 3000;

// Сервисы и Middleware
const { generateContentWithRetry } = require('./services/aiService');
const { subscriptionGuard } = require('./middlewares/subscriptionGuard');

// Включаем сессии
bot.use(session());

// 🔥 ЗАЩИТА: Весь входящий трафик (кнопки, сообщения, команды) идет через этот фильтр
bot.use(subscriptionGuard);

// --- СВЯЗЫВАЕМ МОДУЛИ ---
require('./commands/start')(bot);
require('./commands/profile')(bot);

require('./actions/mainMenu')(bot);
require('./actions/words')(bot);
require('./actions/task')(bot);
require('./actions/lessons')(bot);
require('./actions/myVocabulary')(bot);
require('./actions/today')(bot);

require('./cron/dailyLesson')(bot);

// --- 🌍 НАСТРОЙКА ЧАСОВЫХ ПОЯСОВ ---
async function sendTimezoneMenu(ctx, isEdit = false) {
  const text = '🌍 <b>НАСТРОЙКА ВРЕМЕНИ АКАДЕМИИ</b>\n───────────────────────\nБро, выбери регион, чтобы уроки приходили строго в 07:00 утра по твоему времени!';
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🇰🇬 🇰🇿 🇺🇿 Средняя Азия (UTC+5/6)', 'tz_group_asia')],
    [Markup.button.callback('🇷🇺 Москва и СНГ (UTC+3)', 'tz_group_moscow')],
    [Markup.button.callback('🇪🇺 Европа (UTC+1/2)', 'tz_group_europe')],
    [Markup.button.callback('🌎 Другие пояса / США', 'tz_group_other')]
  ]);
  return isEdit ? ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard }) : ctx.replyWithHTML(text, keyboard);
}

bot.command('timezone', async (ctx) => await sendTimezoneMenu(ctx, false));

bot.action('tz_group_asia', async (ctx) => {
  await ctx.editMessageText('📍 <b>Выбери город:</b>', { parse_mode: 'HTML', ...Markup.inlineKeyboard([
      [Markup.button.callback('Бишкек (UTC+6)', 'set_tz_Asia/Bishkek'), Markup.button.callback('Алматы (UTC+5)', 'set_tz_Asia/Almaty')],
      [Markup.button.callback('Ташкент (UTC+5)', 'set_tz_Asia/Tashkent')],
      [Markup.button.callback('⬅️ Назад', 'tz_back')]
  ])});
});

bot.action('tz_group_moscow', async (ctx) => {
  await ctx.editMessageText('📍 <b>Выбери регион:</b>', { parse_mode: 'HTML', ...Markup.inlineKeyboard([
      [Markup.button.callback('Москва (UTC+3)', 'set_tz_Europe/Moscow'), Markup.button.callback('Минск (UTC+3)', 'set_tz_Europe/Minsk')],
      [Markup.button.callback('Баку (UTC+4)', 'set_tz_Asia/Baku')],
      [Markup.button.callback('⬅️ Назад', 'tz_back')]
  ])});
});

bot.action('tz_group_europe', async (ctx) => {
  await ctx.editMessageText('📍 <b>Выбери пояс:</b>', { parse_mode: 'HTML', ...Markup.inlineKeyboard([
      [Markup.button.callback('Берлин (UTC+1)', 'set_tz_Europe/Berlin'), Markup.button.callback('Киев (UTC+2)', 'set_tz_Europe/Kiev')],
      [Markup.button.callback('Лондон (UTC+0)', 'set_tz_Europe/London')],
      [Markup.button.callback('⬅️ Назад', 'tz_back')]
  ])});
});

bot.action('tz_group_other', async (ctx) => {
  await ctx.editMessageText('📍 <b>Популярные пояса:</b>', { parse_mode: 'HTML', ...Markup.inlineKeyboard([
      [Markup.button.callback('Нью-Йорк (UTC-5)', 'set_tz_America/New_York')],
      [Markup.button.callback('Дубай (UTC+4)', 'set_tz_Asia/Dubai')],
      [Markup.button.callback('Бангкок (UTC+7)', 'set_tz_Asia/Bangkok')],
      [Markup.button.callback('⬅️ Назад', 'tz_back')]
  ])});
});

bot.action('tz_back', async (ctx) => await sendTimezoneMenu(ctx, true));

bot.action(/^set_tz_(.+)$/, async (ctx) => {
  ctx.session.timezone = ctx.match[1];
  await ctx.answerCbQuery('Время успешно настроено! 🔥');
  await ctx.deleteMessage().catch(() => {});
  await ctx.replyWithHTML(`🎯 <b>Часовой пояс <code>${ctx.session.timezone}</code> сохранен!</b>\nТеперь Майкл будет писать тебе вовремя.`);
});

// --- ОБРАБОТКА ТЕКСТА (ДОМАШКА) ---
bot.on('text', async ctx => {
  if (!ctx.session.waitingForHomework) return;
  const userHomework = ctx.message.text;
  const currentTopic = ctx.session.currentTopic || 'General English';
  ctx.session.waitingForHomework = false;
  const waitingMsg = await ctx.reply('🔄 ИИ-Учитель проверяет твою работу...');

  try {
    const prompt = `Ты — Майкл, преподаватель с 40-летним опытом. Проверь текст студента: "${userHomework}". Тема: "${currentTopic}". Дай разбор с блоками: ❌ ОШИБКИ, 📝 ИДЕАЛЬНАЯ ВЕРСИЯ, 💡 ПОЧЕМУ ТАК?, 🚀 СЛЕНГ, 🎯 ЗАДАНИЕ, 🌟 СОВЕТ. Используй только HTML теги.`;
    const response = await generateContentWithRetry({ model: 'gemini-2.0-flash', contents: prompt }, 3, 2500);
    
    await ctx.telegram.deleteMessage(ctx.chat.id, waitingMsg.message_id).catch(() => {});
    await sendLongMessage(ctx, response.text, Markup.inlineKeyboard([
      [Markup.button.callback('📖 Урок дня', 'action_today'), Markup.button.callback('⬅️ В меню', 'action_main_menu')]
    ]));
  } catch (error) {
    await ctx.reply('⚠️ Ошибка ИИ. Попробуй позже.');
  }
});

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
async function sendLongMessage(ctx, text, keyboard = null) {
  if (text.length <= 4000) return ctx.replyWithHTML(text, keyboard);
  const chunks = text.match(/.{1,4000}/gs);
  for (const chunk of chunks) await ctx.replyWithHTML(chunk);
}

// --- СЕРВЕР И ЗАПУСК ---
app.use(express.json());
app.get('/', (req, res) => res.send("🤖 Academy is running!"));

function startBot() {
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
  if (RENDER_URL) {
    const secretPath = `/telegraf/${bot.secretPathComponent()}`;
    app.use(bot.webhookCallback(secretPath));
    app.listen(PORT, async () => {
      await bot.telegram.setWebhook(`${RENDER_URL}${secretPath}`);
      console.log('🚀 Бот запущен (WEBHOOK)');
    });
  } else {
    app.listen(PORT, () => console.log(`🚀 Бот запущен (LOCAL) на порту ${PORT}`));
    bot.launch();
  }
}

startBot();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));