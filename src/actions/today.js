const { Markup } = require("telegraf");
const topics = require("../data/topics");
const { getUserById } = require("../services/userService");
const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = "Ты — харизматичный американский преподаватель английского языка по имени Майкл. Ты объясняешь грамматику и правила разговорного американского английского простым, живым языком с использованием сленга, примеров и юмора. Пиши компактно, структурировано, без лишней воды.";

const getLessonPrompt = (topic, day) => {
  return `Напиши мощный, короткий и понятный интерактивный урок для темы: "${topic}" (День ${day}).\n\n` +
    `Структура урока СТРОГО в следующем формате без markdown блоков:\n\n` +
    `📖 <b>УРОК ДНЯ: [НАЗВАНИЕ ТЕМЫ]</b>\n` +
    `───────────────────────\n` +
    `⚡️ <b>Michael's Note (Вводная мысль):</b>\n` +
    `[Короткое живое введение от Майкла]\n\n` +
    `💡 <b>Главное правило / Грамматика:</b>\n` +
    `[Понятное объяснение сути темы в 2-3 абзаца]\n\n` +
    `🔥 <b>Примеры из реальной жизни (Живой сленг):</b>\n` +
    `• <code>[Фраза на английском]</code> — [Перевод] ([Где/зачем используется])\n` +
    `• <code>[Фраза на английском]</code> — [Перевод]\n\n` +
    `───────────────────────\n` +
    `⚠️ СТРОЖАЙШИЕ ПРАВИЛА РАЗМЕТКИ:\n` +
    `- Разрешено использовать ТОЛЬКО три тега: <b>, <i>, <code>.\n` +
    `- Категорически ЗАПРЕЩЕНО использовать Markdown (никаких **, #, \`).\n` +
    `- Не пиши огромные простыни текста, только самую выжимку сочную.`;
};

module.exports = (bot) => {
  bot.action("action_today", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    
    if (!ctx.session) ctx.session = {};
    
    let currentDay = 1;
    let currentTopic = "Daily American English";

    // 1. Тянем актуальный день студента прямо из базы данных Neon
    try {
      const user = await getUserById(ctx.from.id);
      if (user && user.current_day) {
        currentDay = user.current_day;
        // Предполагаем, что в topics есть метод получения темы по дню
        if (typeof topics.getTopicById === "function") {
          currentTopic = topics.getTopicById(currentDay);
        } else if (Array.isArray(topics)) {
          // Если topics — это просто массив строк/объектов
          currentTopic = topics[currentDay - 1]?.name || topics[currentDay - 1] || currentTopic;
        }
      }
    } catch (err) {
      console.error("❌ Ошибка получения прогресса дня из БД:", err.message);
    }

    // Сохраняем в сессию, чтобы кнопка "Слова дня" знала, какую тему генерировать
    ctx.session.currentDay = currentDay;
    ctx.session.currentTopic = currentTopic;

    // Выводим красивый статус загрузки
    await ctx.editMessageText(
      `⏳ <b>Майкл открывает учебник и готовит доску...</b>\n\n` +
      `Загружаем материалы для: <code>День ${currentDay} — ${currentTopic}</code>`,
      { parse_mode: "HTML" }
    ).catch(() => {});

    try {
      // 2. Генерируем сочную теорию урока через ИИ
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: getLessonPrompt(currentTopic, currentDay),
        config: { systemInstruction: SYSTEM_INSTRUCTION }
      });

      let lessonText = response.text;

      // Очищаем от возможных косяков разметки нейронки
      lessonText = lessonText
        .replace(/^```html?\s*/i, "")
        .replace(/```\s*$/, "")
        .replace(/<\/?ul>/gi, "")
        .replace(/<\/?ol>/gi, "")
        .replace(/<li>/gi, "• ")
        .replace(/<\/li>/gi, "\n");

      // Добавляем красивую панель навигации внизу урока
      const keyboard = Markup.inlineKeyboard([
        [
          // Юзер может сразу из урока прыгнуть в генерацию 100 слов по этой же теме!
          Markup.button.callback("📚 Слова к этому уроку", "action_words")
        ],
        [
          Markup.button.callback("📝 Получить домашку", "action_task"),
          Markup.button.callback("⬅️ В меню", "action_main_menu")
        ]
      ]);

      // Отправляем готовый урок
      await ctx.replyWithHTML(lessonText, { reply_markup: keyboard.reply_markup });

    } catch (error) {
      console.error("❌ Ошибка генерации урока дня через Gemini:", error.message);
      await ctx.replyWithHTML(
        `⚠️ Йоу, бро, что-то сервер Майкла прилёг. Давай попробуем открыть учебник ещё раз!`,
        { reply_markup: Markup.inlineKeyboard([[Markup.button.callback("⬅️ Вернуться в меню", "action_main_menu")]]).reply_markup }
      ).catch(() => {});
    }
  });
};