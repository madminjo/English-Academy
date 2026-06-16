const { Markup } = require("telegraf");
const topics = require("../data/topics");
const { getUserById } = require("../services/userService");
// Импортируем метод пула аккаунтов из aiService
const { generateContentWithRetry } = require("../services/aiService");
// Подключаем наш dbService для работы с Neon PostgreSQL
const db = require("../services/dbService"); 

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
        if (typeof topics.getTopicById === "function") {
          currentTopic = topics.getTopicById(currentDay);
        } else if (Array.isArray(topics)) {
          currentTopic = topics[currentDay - 1]?.name || topics[currentDay - 1] || currentTopic;
        }
      }
    } catch (err) {
      console.error("❌ Ошибка получения прогресса дня из БД:", err.message);
    }

    // Сохраняем в сессию, чтобы кнопки знали тему
    ctx.session.currentDay = currentDay;
    ctx.session.currentTopic = currentTopic;

    // Выводим красивый статус загрузки
    await ctx.editMessageText(
      `⏳ <b>Майкл открывает учебник и готовит доску...</b>\n\n` +
      `Загружаем материалы для: <code>День ${currentDay} — ${currentTopic}</code>`,
      { parse_mode: "HTML" }
    ).catch(() => {});

    // Клавиатура навигации
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback("📚 Слова к этому уроку", "action_words")
      ],
      [
        Markup.button.callback("📝 Получить домашку", "action_task"),
        Markup.button.callback("⬅️ В меню", "action_main_menu")
      ]
    ]);

    let lessonText = null;

    // 2. ШАГ: Проверяем, генерировал ли кто-то этот день ранее (Ищем в кэше Neon)
    try {
      const cachedLesson = await db.query(
        "SELECT lesson_text FROM generated_lessons WHERE day_number = $1", 
        [currentDay]
      );
      
      if (cachedLesson.rows && cachedLesson.rows.length > 0) {
        lessonText = cachedLesson.rows[0].lesson_text;
        console.log(`[БД Кэш] Урок дня ${currentDay} успешно взят из базы.`);
      }
    } catch (dbErr) {
      console.error("❌ Ошибка чтения кэша уроков:", dbErr.message);
    }

    // 3. ШАГ: Если в базе пусто, генерируем через пул ИИ с разных аккаунтов
    if (!lessonText) {
      try {
        const response = await generateContentWithRetry({
          model: "gemini-2.0-flash",
          contents: getLessonPrompt(currentTopic, currentDay),
          config: { systemInstruction: SYSTEM_INSTRUCTION }
        }, 4, 3000); // 4 попытки, шаг паузы 3 секунды

        lessonText = response.text;

        // Очищаем от возможных косяков разметки нейронки
        lessonText = lessonText
          .replace(/^```html?\s*/i, "")
          .replace(/```\s*$/, "")
          .replace(/<\/?ul>/gi, "")
          .replace(/<\/?ol>/gi, "")
          .replace(/<li>/gi, "• ")
          .replace(/<\/li>/gi, "\n");

        // 4. ШАГ: Сохраняем свежий урок в базу, чтобы больше ИИ не дёргать
        try {
          await db.query(
            "INSERT INTO generated_lessons (day_number, topic_name, lesson_text) VALUES ($1, $2, $3) ON CONFLICT (day_number) DO NOTHING",
            [currentDay, currentTopic, lessonText]
          );
          console.log(`[БД Кэш] Новый урок для дня ${currentDay} сохранен в базу.`);
        } catch (saveErr) {
          console.error("❌ Не удалось сохранить урок в базу:", saveErr.message);
        }

      } catch (error) {
        console.error("❌ Тотальный сбой генерации урока через Gemini:", error.message);
        return ctx.replyWithHTML(
          "⚠️ Йоу, бро, что-то сервер Майкла прилёг из-за наплыва студентов. Давай попробуем открыть учебник ещё раз через минутку!",
          { reply_markup: Markup.inlineKeyboard([[Markup.button.callback("⬅️ Вернуться в меню", "action_main_menu")]]).reply_markup }
        ).catch(() => {});
      }
    }

    // 5. ШАГ: Если текст урока получен (из БД или от ИИ), отправляем его юзеру
    if (lessonText) {
      await ctx.replyWithHTML(lessonText, { reply_markup: keyboard.reply_markup });
    }
  });
};