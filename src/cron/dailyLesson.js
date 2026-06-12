const cron = require("node-cron");
const { getAllUsers } = require("../services/userService");
const { Markup } = require("telegraf");
const { GoogleGenAI } = require("@google/genai"); 
const topics = require("../data/topics");

// Инициализируем Gemini API по новому стандарту
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Вспомогательная функция для безопасной отправки длинных сообщений (HTML) в рассылке
async function sendLongMessageToUser(bot, telegramId, text, keyboard = null) {
  const LIMIT = 4000;
  if (text.length <= LIMIT) {
    return bot.telegram.sendMessage(telegramId, text, { parse_mode: "HTML", reply_markup: keyboard?.reply_markup });
  }

  const lines = text.split('\n');
  let currentChunk = '';

  for (const line of lines) {
    if ((currentChunk + line).length > LIMIT) {
      await bot.telegram.sendMessage(telegramId, currentChunk, { parse_mode: "HTML" });
      currentChunk = '';
    }
    currentChunk += line + '\n';
  }

  if (currentChunk.trim().length > 0) {
    return bot.telegram.sendMessage(telegramId, currentChunk, { parse_mode: "HTML", reply_markup: keyboard?.reply_markup });
  }
}

module.exports = (bot) => {
  
  // 🔥 ЗАЩИТА ОТ ДУБЛИРОВАНИЯ: Уничтожаем старые запущенные задачи крона в памяти перед стартом
  const currentTasks = cron.getTasks();
  if (currentTasks.length > 0) {
    console.log(`♻️ [Cron] Найдено ${currentTasks.length} старых задач. Очищаем планировщик...`);
    currentTasks.forEach(task => task.stop());
  }

  // ☀️ 1. УТРЕННЯЯ РАССЫЛКА: УНИКАЛЬНЫЙ ИИ-УРОК ПО ВЫБРАННОЙ ТЕМЕ (07:00 KG)
  cron.schedule("0 7 * * *", async () => {
    console.log("⏰ [Cron] Запуск генерации ИИ-уроков по выбранным темам...");

    let users = await fetchUsersSafely();
    if (!users) return;

    for (const user of users) {
      try {
        const currentDay = user.current_day || 1;
        const topicName = topics.getTopicById(currentDay);

        // 🤖 Прокачанный промпт для Майкла с объяснениями на русском языке
        const prompt = `
          Ты — харизматичный американский преподаватель английского языка по имени Майкл с 40-летним опытом.
          Ты виртуозно владеешь русским языком и используешь его, чтобы создавать живые, понятные утренние уроки.
          Сгенерируй для студента по имени ${user.first_name || "студент"} сочный, интересный утренний урок.
          
          Текущий день обучения: ${currentDay}
          Официальная тема из плана: ${topicName}
          
          Структура ответа, которую ты должен сгенерировать (пиши сплошным HTML текстом):
          1. ☀️ Бодрое приветствие на английском в твоем фирменном американском стиле ("Hey bro!", "Rise and shine, buddy!") и теплое напутствие на русском языке.
          2. 🎯 Название темы: Напиши крупно, что сегодня вы изучаете тему "${topicName}".
          3. 📖 Теория на русском: Объясни эту тему максимально просто, «на пальцах», без занудных терминов, как для 10-летнего ребёнка. Расскажи, в чем фишка этого правила и когда его применять в реальной жизни.
          4. 💡 Примеры: Напиши 3-4 живых примера предложений на английском с переводом на русский. Английские фразы обязательно выделяй тегом <code>.
          5. 📝 Домашнее задание: Придумай на русском языке 2-3 простых и веселых упражнения (например, перевести фразу или составить предложение), чтобы студент закрепил тему "${topicName}".
          
          ⚠️ СТРОЖАЙШИЕ ПРАВИЛА ФОРМАТИРОВАНИЯ ДЛЯ TELEGRAM HTML:
          - Используй ТОЛЬКО три тега: <b> для жирного текста, <i> для курсива и <code> для моноширинного.
          - Никаких маркдаун-звездочек (**)! Вместо них для жирности используй только тег <b>.
          - Категорически ЗАПРЕЩЕНО использовать теги заголовков (<h1>, <h2>, <h3>), списков (<ul>, <li>) или абзацев (<p>). Разделяй блоки просто переносом строки.
          - Если используешь знаки "<" или ">", заменяй их на &lt; и &gt;, чтобы парсер Telegram не выдавал ошибку.
        `;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
        });

        const generatedLesson = response.text;

        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback("📝 Сдать эту домашку", "action_task")]
        ]);

        // Отправляем урок с автоматической защитой от превышения лимита символов
        await sendLongMessageToUser(bot, user.telegram_id, generatedLesson, keyboard);

        // Пауза 150мс, чтобы не спамить Telegram API
        await new Promise((resolve) => setTimeout(resolve, 150));

      } catch (err) {
        console.error(`❌ Ошибка генерации урока для ${user.telegram_id}:`, err.message);
        
        try {
          const fallbackText = `☀️ <b>Good morning!</b>\n\nДоброе утро! Время учиться. Сегодня у тебя по плану тема: <b>${topics.getTopicById(user.current_day || 1)}</b>.\n\nЖми на кнопку ниже, чтобы открыть интерактивный разбор темы прямо сейчас!`;
          await bot.telegram.sendMessage(user.telegram_id, fallbackText, {
            parse_mode: "HTML",
            reply_markup: Markup.inlineKeyboard([[Markup.button.callback("📖 Открыть урок дня", "action_today")]]).reply_markup
          });
        } catch (fbErr) {
          handleSendError(user.telegram_id, fbErr);
        }
      }
    }
    console.log("✅ [Cron] Утренняя рассылка уникальных ИИ-уроков завершена.");
  }, {
    scheduled: true,
    timezone: "Asia/Bishkek"
  });


  // 🥪 2. ДНЕВНАЯ НАПОМИНАЛКА (13:00 по времени Kyrgyzstan)
  cron.schedule("0 13 * * *", async () => {
    let users = await fetchUsersSafely();
    if (!users) return;

    for (const user of users) {
      try {
        const topicName = topics.getTopicById(user.current_day || 1);
        const lunchText = 
          `🥪 <b>ВРЕМЯ ОБЕДА ИЛИ КАК ТАМ ДЗ?</b>\n` +
          `───────────────────────\n` +
          `Привет еще раз, <b>${user.first_name || "студент"}</b>! 👋\n\n` +
          `Уже середина дня. Удалось прочитать утренний ИИ-урок по теме <b>«${topicName}»</b>?\n\n` +
          `🎯 Если есть свободные пару минут, отправь выполненное задание прямо сюда в чат на проверку ИИ-преподавателю!`;

        await bot.telegram.sendMessage(user.telegram_id, lunchText, {
          parse_mode: "HTML",
          reply_markup: Markup.inlineKeyboard([[Markup.button.callback("📝 Написать домашку", "action_task")]]).reply_markup
        });
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (err) {
        handleSendError(user.telegram_id, err);
      }
    }
  }, {
    scheduled: true,
    timezone: "Asia/Bishkek"
  });


  // 🌙 3. ВЕЧЕРНЯЯ РАССЫЛКА (22:00 по времени Kyrgyzstan)
  cron.schedule("0 22 * * *", async () => {
    let users = await fetchUsersSafely();
    if (!users) return;

    for (const user of users) {
      try {
        const nightText = 
          `🌙 <b>ВРЕМЯ ОТДЫХАТЬ (GOOD NIGHT)</b>\n` +
          `───────────────────────\n` +
          `Пришло время подвести итоги дня! ✨\n\n` +
          `Если ты сегодня потренировался — ты огромный молодец, шаг к свободному английскому сделан. Отложи телефон и дай мозгу отдохнуть. Спокойной ночи! Sleep tight! 😴`;

        await bot.telegram.sendMessage(user.telegram_id, nightText, {
          parse_mode: "HTML",
          reply_markup: Markup.inlineKeyboard([[Markup.button.callback("🏆 Посмотреть прогресс", "action_profile")]]).reply_markup
        });
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (err) {
        handleSendError(user.telegram_id, err);
      }
    }
  }, {
    scheduled: true,
    timezone: "Asia/Bishkek"
  });
};

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
async function fetchUsersSafely() {
  try {
    const users = await getAllUsers();
    if (!users || users.length === 0) return null;
    return users;
  } catch (dbError) {
    console.error("❌ [Cron] Ошибка БД:", dbError.message);
    return null;
  }
}

function handleSendError(telegramId, err) {
  if (err.code === 403) {
    console.log(`🚫 Пользователь ${telegramId} заблокировал бота.`);
  } else {
    console.error(`❌ Ошибка отправки пользователю ${telegramId}:`, err.message);
  }
}