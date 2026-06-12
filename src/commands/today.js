const { Markup } = require("telegraf");

module.exports = (bot) => {
  const showToday = async (ctx) => {
    if (ctx.callbackQuery) await ctx.answerCbQuery();

    const lessonText = 
      `📖 <b>УРОК ДНЯ: День 1</b>\n` +
      `───────────────────────\n` +
      `📚 <b>Грамматика (Grammar):</b>\n` +
      `<code>👉 English Alphabet & Sounds</code>\n\n` +
      `🆕 <b>Новые слова (Vocabulary):</b>\n` +
      `• Apple — <i>Яблоко</i>\n` +
      `• Book — <i>Книга</i>\n` +
      `• Code — <i>Код / Программировать</i>\n\n` +
      `📖 <b>Чтение (Reading):</b>\n` +
      `💬 <i>"A short story about a coder who wanted to learn English..."</i>\n\n` +
      `📝 <b>Практическое задание:</b>\n` +
      `Напишите 5 простых предложений о себе прямо в этот чат!`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback("✅ Выполнить задание", "action_task")],
      [Markup.button.callback("⬅️ Назад в меню", "action_main_menu")]
    ]);

    if (ctx.callbackQuery) {
      await ctx.editMessageText(lessonText, { parse_mode: "HTML", reply_markup: keyboard.reply_markup });
    } else {
      await ctx.replyWithHTML(lessonText, keyboard);
    }
  };

  bot.command("today", showToday);
  bot.action("action_today", showToday);
};