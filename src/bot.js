require("dotenv").config();
const { Telegraf, Markup, session } = require("telegraf"); 
const { GoogleGenAI } = require("@google/genai"); 

const bot = new Telegraf(process.env.BOT_TOKEN);

// Включаем сессии
bot.use(session());

// Инициализируем Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// --- СВЯЗЫВАЕМ СТРУКТУРУ ПРОЕКТА (ПОДКЛЮЧАЕМ МОДУЛИ) ---

// 1. Текстовые команды (/start, /today и т.д.)
require("./commands/start")(bot);
// require("./commands/today")(bot);
require("./commands/profile")(bot);

// 2. Инлайн-кнопки (наше разделение по файлам)
require("./actions/mainMenu")(bot);
require("./actions/words")(bot);
require("./actions/task")(bot);
require("./actions/lessons")(bot);
require("./actions/myVocabulary")(bot);
require("./actions/today")(bot);

// 3. Крон-планировщик рассылок
require("./cron/dailyLesson")(bot);

const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

// 🔥 ВАЖНО: Добавили парсер для обработки входящих JSON-пакетов от Telegram
app.use(express.json());

// Создаем простейший роут для проверки живой ли бот
app.get("/", (req, res) => {
  res.send("🤖 Michael's Academy is alive and running 24/7!");
});

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
async function sendLongMessage(ctx, text, keyboard = null) {
  const LIMIT = 4000;
  if (text.length <= LIMIT) return ctx.replyWithHTML(text, keyboard);

  const lines = text.split('\n');
  let currentChunk = '';

  for (const line of lines) {
    if ((currentChunk + line).length > LIMIT) {
      await ctx.replyWithHTML(currentChunk);
      currentChunk = '';
    }
    currentChunk += line + '\n';
  }

  if (currentChunk.trim().length > 0) {
    return ctx.replyWithHTML(currentChunk, keyboard);
  }
}

// --- ОБРАБОТКА ТЕКСТА ДОМАШКИ ---
bot.on("text", async (ctx) => {
  ctx.session = ctx.session || {};

  // 🔥 СТИЛИЗОВАЛИ ЗАГЛУШКУ ПОД ОБЩИЙ ДИЗАЙН АКАДЕМИИ
  if (!ctx.session.waitingForHomework) {
    return ctx.replyWithHTML(
      `🤖 <b>AMERICAN ENGLISH ACADEMY</b>\n` +
      `───────────────────────\n` +
      `Привет, bro! Чтобы отправить текст на проверку ИИ-преподавателю, сначала нажми на кнопку <b>«📝 Сдать домашку»</b> в главном меню или введи команду /start.`
    );
  }

  const userHomework = ctx.message.text;
  const currentTopic = ctx.session.currentTopic || "Общая грамматика";
  const currentDay = ctx.session.currentDay || 1;
  
  ctx.session.waitingForHomework = false;

  const waitingMsg = await ctx.reply("🔄 ИИ-Учитель внимательно читает твой текст и сверяет с темой урока... Секундочку...");

  try {
    const prompt = `
Ты — харизматичный американский преподаватель английского языка по имени Майкл с 40-летним опытом. 
Ты виртуозно владеешь русским языком и используешь его, чтобы объяснять русскоязычным студентам сложнейшие правила английского так просто, живо и весело, будто твоему ученику 10 лет. 

Никаких занудных лингвистических терминов! Твой стиль — это дружеский, поддерживающий, чисто американский вайб ("Hey bro!", "You can do it!", "Easy peasy!"), но все объяснения, разборы ошибок, лайфхаки и переводы ты пишешь на ПОНЯТНОМ, ЖИВОМ РУССКОМ ЯЗЫКЕ.

Контекст:
День: ${currentDay}
Тема: "${currentTopic}"
Домашняя работа студента: "${userHomework}"

Твоя задача — проверить работу и выдать красивый, структурированный ответ строго по шаблону ниже на русском языке.

Выдавай ответ СТРОГО в следующем формате:
────────────────────
❌ <b>Ошибки:</b> 
[Разбор ошибок]
────────────────────
📝 <b>Исправленный текст:</b>
<code>[Идеальный текст]</code>
────────────────────
💡 <b>Объяснение темы "${currentTopic}":</b>
[Простое объяснение]
────────────────────
👑 <b>Главное правило:</b>
[Правило]
────────────────────
🚀 <b>5 простых примеров:</b>
[Примеры с переводом]
────────────────────
🤔 <b>5 вопросов для практики:</b>
[Вопросы]
────────────────────
🧠 <b>Мини-тест:</b>
[Тест]
────────────────────
🎯 <b>Дополнительное задание:</b>
[Задание]
────────────────────
🌟 <b>Совет и Мотивация:</b>
[Поддержка]

⚠️ СТРОЖАЙШИЕ ПРАВИЛА ФОРМАТИРОВАНИЯ:
- Разрешено использовать ТОЛЬКО три тега: <b>, <i>, <code>.
- Категорически ЗАПРЕЩЕНО использовать Markdown.
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash", 
      contents: prompt,
    });

    const aiReview = response.text;
    await ctx.telegram.deleteMessage(ctx.chat.id, waitingMsg.message_id).catch(() => {});

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback("📖 Урок дня", "action_today"), Markup.button.callback("⬅️ В меню", "action_main_menu")]
    ]);

    const fullHeaderText = 
      `🇺🇸 <b>AMERICAN ENGLISH ACADEMY</b> 🎓\n` +
      `⚡ <i>Hey bro! Твой личный разбор уже готов!</i>\n` +
      `───────────────────────\n` +
      `🎯 <b>Topic:</b> <code>${currentTopic} (Day ${currentDay})</code>\n` +
      `👨‍🏫 <b>Teacher:</b> <i>Michael (40 years experience)</i>\n` +
      `───────────────────────\n\n` + 
      `${aiReview}`;

    await sendLongMessage(ctx, fullHeaderText, keyboard);

  } catch (error) {
    console.error("❌ Ошибка при проверке задания через Gemini:", error);
    await ctx.telegram.deleteMessage(ctx.chat.id, waitingMsg.message_id).catch(() => {});
    await ctx.reply("⚠️ Сервер ИИ временно задумался. Попробуй позже.", 
      Markup.inlineKeyboard([[Markup.button.callback("⬅️ В меню", "action_main_menu")]])
    );
  }
});

// 🔥 УМНЫЙ ЗАПУСК: Объединяем Express и Telegram-сервер
function startBot() {
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL; // Render сам подставит твой URL на сервере

  if (RENDER_URL) {
    // 🌐 На сервере Render: работаем через стабильные Webhooks
    const secretPath = `/telegraf/${bot.secretPathComponent()}`;
    
    app.use(bot.webhookCallback(secretPath));
    
    app.listen(PORT, async () => {
      console.log(`✅ Веб-сервер запущен на Render. Слушаем порт: ${PORT}`);
      try {
        await bot.telegram.setWebhook(`${RENDER_URL}${secretPath}`);
        console.log(`🚀 [English Master Bot] успешно запущен через WEBHOOK!`);
      } catch (err) {
        console.error("❌ Ошибка установки вебхука Telegram:", err.message);
      }
    });

  } else {
    // 💻 На твоем компьютере: автоматически запускается обычный Long Polling для тестов
    app.listen(PORT, () => {
      console.log(`✅ Локальный веб-сервер запущен на порту: ${PORT}`);
    });

    console.log("⏳ Подключение к Telegram API (Локально)...");
    bot.launch()
      .then(() => console.log("🚀 [English Master Bot] успешно запущен локально!"))
      .catch((err) => {
        console.error("❌ Ошибка запуска бота:", err.message);
        setTimeout(startBot, 10000);
      });
  }
}

// Запускаем единую точку входа
startBot();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));