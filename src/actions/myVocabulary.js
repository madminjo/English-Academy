const { Markup } = require("telegraf");

module.exports = (bot) => {
  // Функция для парсинга сохраненного текста в массив чистых строк со словами
  const parseWordsToArray = (rawText) => {
    if (!rawText) return [];
    return rawText
      .split("\n")
      .map(line => line.trim())
      .filter(line => line && /^\d+\./.test(line)); // Берем только строки, начинающиеся с цифры (напр. "1. Hand...")
  };

  bot.action(/action_my_vocabulary(_page_(\d+))?/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    
    if (!ctx.session) ctx.session = {};
    
    // Определяем текущую страницу пагинации (по умолчанию 1)
    const page = ctx.match && ctx.match[2] ? parseInt(ctx.match[2]) : 1;
    const wordsPerPage = 20; // Выводим по 20 слов, чтобы текст легко читался

    const savedRawText = ctx.session.generatedWords;
    const allWords = parseWordsToArray(savedRawText);

    // Если словарь пуст
    if (allWords.length === 0) {
      const emptyText = 
        `🗂 <b>ТВОЙ ЛИЧНЫЙ СЛОВАРЬ</b>\n` +
        `───────────────────────\n\n` +
        `😔 Здесь пока пусто, бро. Ты еще не сохранил ни одного пака слов.\n\n` +
        `🎯 Зайди в раздел <b>«📚 Слова дня»</b>, сгенерируй подборку от Майкла и нажми кнопку «Сохранить»!`;

      return ctx.editMessageText(emptyText, {
        parse_mode: "HTML",
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback("⬅️ Назад в меню", "action_main_menu")]]).reply_markup
      }).catch(() => {});
    }

    // Рассчитываем индексы для текущей страницы
    const totalPages = Math.ceil(allWords.length / wordsPerPage);
    const startIndex = (page - 1) * wordsPerPage;
    const endIndex = startIndex + wordsPerPage;
    const pageWords = allWords.slice(startIndex, endIndex);

    // Собираем текст сообщения
    const vocabularyText = 
      `🗂 <b>ТВОЙ ЛИЧНЫЙ СЛОВАРЬ (Стр. ${page}/${totalPages})</b>\n` +
      `───────────────────────\n` +
      `🔥 <i>Эти слова ты добавил на изучение. Повторяй их каждый день!</i>\n` +
      `───────────────────────\n\n` +
      `${pageWords.join("\n")}\n\n` +
      `───────────────────────\n` +
      `📈 Всего на изучении: <b>${allWords.length}</b> слов.`;

    // Собираем динамические кнопки пагинации
    const navigationButtons = [];
    if (page > 1) {
      navigationButtons.push(Markup.button.callback("⬅️ Назад", `action_my_vocabulary_page_${page - 1}`));
    }
    if (page < totalPages) {
      navigationButtons.push(Markup.button.callback("Вперед ➡️", `action_my_vocabulary_page_${page + 1}`));
    }

    const keyboard = Markup.inlineKeyboard([
      navigationButtons, // Ряд с кнопками "Назад / Вперед" (появится только если надо)
      [Markup.button.callback("⬅️ Главное меню", "action_main_menu")]
    ]);

    await ctx.editMessageText(vocabularyText, {
      parse_mode: "HTML",
      reply_markup: keyboard.reply_markup
    }).catch((err) => console.log("Ошибка обновления страницы словаря:", err.message));
  });
};