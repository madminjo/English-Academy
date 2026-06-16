const { Markup } = require('telegraf');
const topics = require('../data/topics');
const { getUserById } = require('../services/userService');
const { generateContentWithRetry } = require('../services/aiService');
const db = require('../services/dbService'); // Подключаем базу данных

const SYSTEM_INSTRUCTION = 'Ты — харизматичный американский преподаватель английского языка по имени Майкл. Ты объясняешь грамматику и правила разговорного американского английского простым, живым языком с использованием сленга, примеров и юмора. Пиши компактно, структурировано, без лишней воды.';

// Обновленная функция промпта с твоими жесткими рамками для ИИ
const getLessonPrompt = (topicName, targetDay) => {
  return 'Ты — харизматичный американский преподаватель английского языка по имени Майкл. \n' +
    'Ты виртуозно владеешь русским языком. Твой стиль — это дружеский, поддерживающий вайб ("Hey bro!", "Easy peasy!"), ты общаешься просто, живо и используешь понятный русский язык.\n\n' +
    'Твоя задача — сделать экспресс-разбор темы для студента.\n' +
    'Тема: "День ' + targetDay + ' — ' + topicName + '"\n\n' +
    'Напиши структурированный разбор. Твой ответ должен состоять строго из трех блоков.\n\n' +
    'Инструкции для блоков:\n' +
    '1. В блоке "ОБЪЯСНЕНИЕ ТЕМЫ" максимально просто, живым языком на пальцах объясни суть использования ' + topicName + '. Без академического бреда и выдуманных правил вроде "drop the s". Просто объясни логику.\n' +
    '2. В блоке "ГЛАВНОЕ ПРАВИЛО" дай одну четкую, грамматически верную золотую фразу-суть для этой темы на русском.\n' +
    '3. В блоке "ШПАРГАЛКА-ПРИМЕРЫ" напиши ровно 3 живых, разговорных примера на английском с качественным русским переводом через тире.\n\n' +
    '⚠️ КАТЕГОРИЧЕСКИЕ ПРАВИЛА ФОРМАТИРОВАНИЯ И HTML:\n' +
    '1. Пиши БЕЗ использования Markdown. Забудь про звездочки (* или **), решетки (#) и списки.\n' +
    '2. Вместо Markdown для выделения ключевых слов (например, названий правил или самих слов some/any) используй ИСКЛЮЧИТЕЛЬНО HTML-теги: <b>выделение</b> или <code>код</code>.\n' +
    '3. Форматируй блоки строго с использованием эмодзи, как показано ниже, разделяя абзацы обычным переносом строки.\n\n' +
    'Придерживайся структуры:\n' +
    '💡 <b>ОБЪЯСНЕНИЕ ТЕМЫ:</b>\n' +
    '[Твой текст объяснения]\n\n' +
    '👑 <b>ГЛАВНОЕ ПРАВИЛО:</b>\n' +
    '[Твой текст правила]\n\n' +
    '🚀 <b>ШПАРГАЛКА-ПРИМЕРЫ:</b>\n' +
    '1. [Пример] — [Перевод]\n' +
    '2. [Пример] — [Перевод]\n' +
    '3. [Пример] — [Перевод]';
};

module.exports = (bot) => {
  bot.action('action_today', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    
    if (!ctx.session) ctx.session = {};
    
    let currentDay = 1;
    let currentTopic = 'Daily American English';

    // 1. ШАГ: Тянем актуальный день студента прямо из базы данных Neon
    try {
      const user = await getUserById(ctx.from.id);
      if (user && user.current_day) {
        currentDay = user.current_day;
        if (typeof topics.getTopicById === 'function') {
          currentTopic = topics.getTopicById(currentDay);
        } else if (Array.isArray(topics)) {
          currentTopic = topics[currentDay - 1]?.name || topics[currentDay - 1] || currentTopic;
        }
      }
    } catch (err) {
      console.error('❌ Ошибка получения прогресса дня из БД:', err.message);
    }

    // Сохраняем в сессию, чтобы кнопки знали тему
    ctx.session.currentDay = currentDay;
    ctx.session.currentTopic = currentTopic;

    // Выводим красивый статус загрузки
    await ctx.editMessageText(
      '⏳ <b>Майкл открывает учебник и готовит доску...</b>\n\n' +
      'Загружаем материалы для: <code>День ' + currentDay + ' — ' + currentTopic + '</code>',
      { parse_mode: 'HTML' }
    ).catch(() => {});

    // Клавиатура навигации
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📚 Слова к этому уроку', 'action_words')
      ],
      [
        Markup.button.callback('📝 Получить домашку', 'action_task'),
        Markup.button.callback('⬅️ В меню', 'action_main_menu')
      ]
    ]);

    let lessonText = null;

    // 2. ШАГ: Проверяем, генерировал ли кто-то этот день ранее (Ищем в кэше Neon)
    try {
      const cachedLesson = await db.query(
        'SELECT lesson_text FROM generated_lessons WHERE day_number = $1', 
        [currentDay]
      );
      
      if (cachedLesson.rows && cachedLesson.rows.length > 0) {
        lessonText = cachedLesson.rows[0].lesson_text;
        console.log('[БД Кэш] Урок дня ' + currentDay + ' успешно взят из базы.');
      }
    } catch (dbErr) {
      console.error('❌ Ошибка чтения кэша уроков:', dbErr.message);
    }

    // 3. ШАГ: Если в базе пусто, генерируем через пул ИИ с разных аккаунтов
    if (!lessonText) {
      try {
        const response = await generateContentWithRetry({
          model: 'gemini-2.0-flash',
          contents: getLessonPrompt(currentTopic, currentDay),
          config: { systemInstruction: SYSTEM_INSTRUCTION }
        }, 4, 3000); // 4 попытки, шаг паузы 3 секунды

        lessonText = response.text;

        // Очищаем контент от возможных косяков разметки нейронки
        lessonText = lessonText
          .replace(/^```html?\s*/i, '')
          .replace(/```\s*$/, '')
          .replace(/<\/?ul>/gi, '')
          .replace(/<\/?ol>/gi, '')
          .replace(/<li>/gi, '• ')
          .replace(/<\/li>/gi, '\n');

        // 🔥 ПРОГРАММНЫЙ ПРЕДОХРАНИТЕЛЬ: Заменяем случайные звездочки на HTML теги
        lessonText = lessonText.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

        // 4. ШАГ: Сохраняем свежий урок в базу, чтобы больше ИИ не дёргать
        try {
          await db.query(
            'INSERT INTO generated_lessons (day_number, topic_name, lesson_text) VALUES ($1, $2, $3) ON CONFLICT (day_number) DO NOTHING',
            [currentDay, currentTopic, lessonText]
          );
          console.log('[БД Кэш] Новый урок для дня ' + currentDay + ' сохранен в базу.');
        } catch (saveErr) {
          console.error('❌ Не удалось сохранить урок в базу:', saveErr.message);
        }

      } catch (error) {
        console.error('❌ Тотальный сбой генерации урока через пул:', error);
        return ctx.replyWithHTML(
          '⚠️ <b>Бро, пойман баг!</b>\n\n' +
          'Текст ошибки: <code>' + error.message + '</code>\n\n' +
          'Посмотри консоль Render для полной инфы.',
          Markup.inlineKeyboard([[Markup.button.callback('⬅️ Вернуться в меню', 'action_main_menu')]])
        ).catch(() => {});
      }
    }

    // 5. ШАГ: Если текст урока получен (из БД или от ИИ), отправляем его юзеру
    if (lessonText) {
      // Страховочная очистка старого кэша от звездочек перед отправкой в чат
      const cleanLessonText = lessonText.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

      await ctx.replyWithHTML(cleanLessonText, keyboard).catch((err) => {
        console.error('❌ Ошибка отправки сообщения урока в Telegram:', err.message);
      });
    }
  });
};