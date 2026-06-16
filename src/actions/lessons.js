const { Markup } = require("telegraf");
const topics = require("../data/topics");
const { getUserById, updateUserDay } = require("../services/userService");
// Импортируем наш метод пула аккаунтов вместо прямого подключения GoogleGenAI
const { generateContentWithRetry } = require("../services/aiService");

module.exports = (bot) => {
  
  // 1. НАЖАТИЕ НА "🎯 ВЫБОР УРОВНЯ"
  bot.action("action_lessons", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});

    const text = 
      "🎯 <b>ВЫБОР УРОВНЯ ОБУЧЕНИЯ</b>\n" +
      "───────────────────────\n" +
      "Выбери интересующий тебя уровень, чтобы посмотреть список входящих в него тем, или открой полный каталог курсов:";

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback("🟢 A1 - Starter", "level_A1"), Markup.button.callback("🟡 A2 - Pre-Int", "level_A2")],
      [Markup.button.callback("🔵 B1 - Intermediate", "level_B1"), Markup.button.callback("🔴 B2 - Upper-Int", "level_B2")],
      [Markup.button.callback("🟣 C1 - Advanced", "level_C1"), Markup.button.callback("⚫ C2 - Proficiency", "level_C2")],
      [Markup.button.callback("📚 Показать вообще все уроки", "level_ALL")],
      [Markup.button.callback("⬅️ Назад в меню", "action_main_menu")]
    ]);

    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard.reply_markup })
      .catch((err) => console.log("Текст не изменился, игнорируем"));
  });

  // 2. ОБРАБОТЧИК: КЛИК ПО КОНКРЕТНОМУ УРОКУ + ГЕНЕРАЦИЯ ОБЪЯСНЕНИЯ ОТ ИИ
  bot.action(/^select_day_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const targetDay = parseInt(ctx.match[1], 10);
    
    // Безопасный поиск названия темы по ID из структуры уровней
    let topicName = "Выбранный урок";
    if (typeof topics.getTopicById === "function") {
      topicName = topics.getTopicById(targetDay);
    } else {
      for (const level in topics) {
        if (Array.isArray(topics[level])) {
          const found = topics[level].find(t => t && t.id === targetDay);
          if (found) {
            topicName = found.title || found.name || topicName;
            break;
          }
        }
      }
    }

    // Отправляем промежуточный статус
    await ctx.editMessageText("⏳ <b>Майкл уже открывает свой конспект...</b>\n\nГотовим интерактивный разбор темы: <code>День " + targetDay + " — " + topicName + "</code>. Секундочку, bro!", { parse_mode: "HTML" }).catch(() => {});

    try {
      // 1. Сохраняем новый день в базу данных Postgres (Neon)
      await updateUserDay(ctx.from.id, targetDay);

      // 2. Формируем запрос к Gemini
      const prompt = `
Ты — харизматичный американский преподаватель английского языка по имени Майкл с 40-летним опытом. 
Ты виртуозно владеешь русским языком и используешь его, чтобы объяснять русскоязычным студентам сложнейшие правила английского так просто, живо и весело, будто твоему ученику 10 лет. 

Твой стиль — это дружеский, поддерживающий, чисто американский вайб ("Hey bro!", "Easy peasy!"), но все объяснения ты пишешь на ПОНЯТНОМ, ЖИВОМ РУССКОМ ЯЗЫКЕ с примерами.

Твоя задача — дать мощное экспресс-объяснение темы.
Тема: "День ${targetDay} — ${topicName}"

Выдавай ответ СТРОГО в следующем формате:
💡 <b>ОБЪЯСНЕНИЕ ТЕМЫ:</b>
[Объясни эту тему на русском языке максимально просто, «на пальцах», через весёлые жизненные примеры и ассоциации]

👑 <b>ГЛАВНОЕ ПРАВИЛО:</b>
[В одно-два предложения сформулируй на русском языке золотое железобетонное правило этой темы]

🚀 <b>ШПАРГАЛКА-ПРИМЕРЫ:</b>
1. [Пример на английском] — [Перевод на русский]
2. [Пример на английском] — [Перевод на русский]
3. [Пример на английском] — [Перевод на русский]

⚠️ КАТЕГОРИЧЕСКИЕ ПРАВИЛА ФОРМАТИРОВАНИЯ И HTML (НАРУШЕНИЕ СЛОМАЕТ БОТА):
1. Разрешено использовать ТОЛЬКО три тега: <b>, <i>, <code>.
2. ЗАПРЕЩЕНО использовать Markdown (никаких звёздочек **, знаков #).
3. Абсолютно ЗАПРЕЩЕНО использовать теги списков <ul>, <ol>, <li>! Если хочешь сделать список предложений, пиши обычными цифрами с точкой (1., 2., 3.) или эмодзи, перенося строки через обычный \\n.
`;

      const response = await generateContentWithRetry({
        model: "gemini-2.0-flash", 
        contents: prompt,
      }, 4, 3000); // 4 попытки, шаг паузы 3 секунды

      let aiExplanation = response.text;

      // 🔥 ПРОГРАММНЫЙ ФИЛЬТР-ПРЕДОХРАНИТЕЛЬ:
      aiExplanation = aiExplanation
        .replace(/^```html?\s*/i, '') 
        .replace(/```\s*$/, '')       
        .replace(/<\/?ul>/gi, '')     
        .replace(/<\/?ol>/gi, '')     
        .replace(/<li>/gi, '• ')       
        .replace(/<\/li>/gi, '\n');    

      // 3. Формируем финальное стильное сообщение
      const finalExplanationText = 
        "✅ <b>ПРОГРАММА УСПЕШНО ИЗМЕНЕНА!</b>\n" +
        "───────────────────────\n" +
        "🎯 <b>Текущий активный урок:</b> <code>День " + targetDay + " — " + topicName + "</code>\n" +
        "───────────────────────\n\n" +
        aiExplanation + "\n" +
        "───────────────────────\n" +
        "👨‍🏫 <i>\"Now you are ready for some action, bro! Нажми на кнопку ниже, чтобы закрепить тему и сдать домашку!\"</i>";

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("📝 Сдать домашку по этой теме", "action_task")],
        [Markup.button.callback("⬅️ Вернуться к урокам", "action_lessons"), Markup.button.callback("🏠 В меню", "action_main_menu")]
      ]);

      // Изменяем сообщение на готовый разбор
      await ctx.editMessageText(finalExplanationText, {
        parse_mode: "HTML",
        reply_markup: keyboard.reply_markup
      }).catch((err) => console.error("Ошибка обновления сообщения:", err));

    } catch (error) {
      console.error("❌ Ошибка при смене урока или генерации ИИ:", error.message);
      await ctx.reply("⚠️ Произошла ошибка при подготовке урока через пул аккаунтов. Но курс переключен! Ты можешь перейти в раздел «📝 Сдать домашку».");
    }
  });

  // 3. ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ РЕНДЕРА СПИСКА УРОКОВ
  async function renderLessonsList(ctx, targetLevel) {
    let userDay = 1;
    try {
      const user = await getUserById(ctx.from.id);
      if (user && user.current_day) userDay = user.current_day;
    } catch (err) { console.error(err.message); }

    let titleHeader = "";
    let filteredTopics = [];

    if (targetLevel === "ALL") {
      titleHeader = "📚 ВСЕ ТЕМЫ КУРСА";
      for (const levelName in topics) {
        if (Array.isArray(topics[levelName])) filteredTopics = filteredTopics.concat(topics[levelName]);
      }
    } else {
      const exactKey = Object.keys(topics).find(key => key.startsWith(targetLevel));
      titleHeader = "📈 УРОВЕНЬ: " + (exactKey || targetLevel);
      if (exactKey && Array.isArray(topics[exactKey])) filteredTopics = topics[exactKey];
    }

    const buttonsGrid = [];
    let descriptionText = "";

    filteredTopics.forEach((topic) => {
      if (topic && topic.id) {
        const isCurrent = topic.id === userDay;
        buttonsGrid.push([Markup.button.callback((isCurrent ? "🔥" : "📖") + " День " + topic.id + " — " + topic.title, "select_day_" + topic.id)]);
        if (isCurrent) descriptionText = "\n🎯 <b>Сейчас твой активный урок:</b> <code>День " + topic.id + " — " + topic.title + "</code>\n\n";
      }
    });

    buttonsGrid.push([Markup.button.callback("⬅️ К выбору уровней", "action_lessons")]);

    await ctx.editMessageText("🎯 <b>" + titleHeader + "</b>\n───────────────────────\n" + descriptionText + "👇 <b>Кликни по любому уроку ниже, чтобы переключить программу обучения и сразу получить разбор от Майкла:</b>", {
      parse_mode: "HTML",
      reply_markup: Markup.inlineKeyboard(buttonsGrid).reply_markup
    }).catch(() => {});
  }

  // СЛУШАТЕЛИ КЛИКОВ ПО УРОВНЯМ
  bot.action("level_A1", async (ctx) => { await ctx.answerCbQuery().catch(() => {}); await renderLessonsList(ctx, "A1"); });
  bot.action("level_A2", async (ctx) => { await ctx.answerCbQuery().catch(() => {}); await renderLessonsList(ctx, "A2"); });
  bot.action("level_B1", async (ctx) => { await ctx.answerCbQuery().catch(() => {}); await renderLessonsList(ctx, "B1"); });
  bot.action("level_B2", async (ctx) => { await ctx.answerCbQuery().catch(() => {}); await renderLessonsList(ctx, "B2"); });
  bot.action("level_C1", async (ctx) => { await ctx.answerCbQuery().catch(() => {}); await renderLessonsList(ctx, "C1"); });
  bot.action("level_C2", async (ctx) => { await ctx.answerCbQuery().catch(() => {}); await renderLessonsList(ctx, "C2"); });
  bot.action("level_ALL", async (ctx) => { await ctx.answerCbQuery().catch(() => {}); await renderLessonsList(ctx, "ALL"); });

  // Временная заглушка для напоминаний
  bot.action("action_reminders", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.editMessageText("🔔 <b>Настройка уведомлений</b>\n\n⚙️ Модуль умных напоминаний создается. Здесь ты сможешь настроить удобное время для ежедневных тренивок!", {
      parse_mode: "HTML",
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback("⬅️ Назад", "action_main_menu")]]).reply_markup
    }).catch(() => {});
  });
};