const { Markup } = require('telegraf');
const topics = require('../data/topics');
const { getUserById } = require('../services/userService');
const { generateContentWithRetry } = require('../services/aiService');
const db = require('../services/dbService');

const SYSTEM_INSTRUCTION = 'Ты — харизматичный американский преподаватель английского языка по имени Майкл. Ты объясняешь грамматику и правила разговорного американского английского простым, живым языком с использованием сленга, примеров и юмора.';

const getLessonPrompt = (topicName, targetDay) => {
  return 'Ты — Майкл, харизматичный преподаватель американского английского. Твой стиль: дружеский вайб ("Hey bro!", "Easy peasy!"), ты общаешься живо, понятно и очень подробно. Никакой краткости в ущерб качеству!\n\n' +
    'Твоя задача — сделать МЕГА-РАЗБОР темы: "День ' + targetDay + ' — ' + topicName + '"\n\n' +
    'Структура ответа:\n' +
    '💡 <b>ОБЪЯСНЕНИЕ ТЕМЫ:</b>\n' +
    'Начни с живой аналогии из жизни. Подробно объясни логику. Используй абзацы.\n\n' +
    '👑 <b>ГЛАВНОЕ ПРАВИЛО:</b>\n' +
    'Золотая формула правила на русском.\n\n' +
    '🚀 <b>ШПАРГАЛКА-ПРИМЕРЫ С РАЗБОРОМ:</b>\n' +
    'Напиши 3 примера:\n1. Фраза. 2. Перевод. 3. Комментарий Майкла (почему так говорят).\n\n' +
    '⚠️ <b>ПРАВИЛА ФОРМАТИРОВАНИЯ:</b>\n' +
    '1. ИСПОЛЬЗУЙ ТОЛЬКО HTML: <b>, <code>, <i>.\n' +
    '2. НИКАКОГО Markdown (**, #).\n' +
    '3. Текст должен быть объёмным и глубоким!';
};

// Функция для отправки длинных сообщений частями
async function sendSplitMessage(ctx, text, keyboard) {
  const MAX_LENGTH = 4000;
  if (text.length <= MAX_LENGTH) {
    return ctx.replyWithHTML(text, keyboard);
  }
  const chunks = text.match(new RegExp(`.{1,${MAX_LENGTH}}(\n|$)`, 'gs')) || [text];
  for (let i = 0; i < chunks.length; i++) {
    await ctx.replyWithHTML(chunks[i], i === chunks.length - 1 ? keyboard : null);
  }
}

module.exports = (bot) => {
  bot.action('action_today', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    
    if (!ctx.session) ctx.session = {};
    
    let currentDay = 1;
    let currentTopic = 'Daily American English';

    try {
      const user = await getUserById(ctx.from.id);
      if (user?.current_day) {
        currentDay = user.current_day;
        currentTopic = typeof topics.getTopicById === 'function' ? topics.getTopicById(currentDay) : (topics[currentDay - 1]?.name || currentTopic);
      }
    } catch (err) { console.error('Ошибка БД:', err.message); }

    ctx.session.currentDay = currentDay;
    ctx.session.currentTopic = currentTopic;

    // Выводим статус и сохраняем его ID для удаления
    const statusMsg = await ctx.replyWithHTML(
      '⏳ <b>Майкл открывает учебник и готовит доску...</b>\n\n' +
      'Загружаем: <code>День ' + currentDay + ' — ' + currentTopic + '</code>'
    ).catch(() => {});

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📚 Слова к этому уроку', 'action_words')],
      [Markup.button.callback('📝 Получить домашку', 'action_task'), Markup.button.callback('⬅️ В меню', 'action_main_menu')]
    ]);

    let lessonText = null;

    try {
      const cached = await db.query('SELECT lesson_text FROM generated_lessons WHERE day_number = $1', [currentDay]);
      if (cached.rows?.length > 0) {
        lessonText = cached.rows[0].lesson_text;
      }
    } catch (dbErr) { console.error('Ошибка кэша:', dbErr.message); }

    if (!lessonText) {
      try {
        const response = await generateContentWithRetry({
          model: 'gemini-2.0-flash',
          contents: getLessonPrompt(currentTopic, currentDay),
          config: { systemInstruction: SYSTEM_INSTRUCTION }
        }, 4, 3000);

        lessonText = response.text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

        await db.query(
          'INSERT INTO generated_lessons (day_number, topic_name, lesson_text) VALUES ($1, $2, $3) ON CONFLICT (day_number) DO NOTHING',
          [currentDay, currentTopic, lessonText]
        );
      } catch (error) {
        console.error('Ошибка ИИ:', error);
        await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
        return ctx.reply('⚠️ Ошибка генерации. Попробуй позже.');
      }
    }

    // Удаляем статус загрузки
    if (statusMsg) {
      await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
    }

    // Отправляем урок
    if (lessonText) {
      await sendSplitMessage(ctx, lessonText, keyboard);
    }
  });
};