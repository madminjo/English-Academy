const { Markup } = require("telegraf");
const topics = require("../data/topics");
const { getUserById } = require("../services/userService");

module.exports = (bot) => {
  bot.action("action_task", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    
    ctx.session = ctx.session || {};
    ctx.session.waitingForHomework = true;

    let topicName = "Общая практика";
    let currentDay = 1;

    try {
      const user = await getUserById(ctx.from.id);
      if (user && user.current_day) {
        currentDay = user.current_day;
        topicName = topics.getTopicById(currentDay);
      }
    } catch (dbError) {
      console.error("⚠️ Не удалось загрузить тему пользователя из БД:", dbError.message);
    }

    ctx.session.currentTopic = topicName;
    ctx.session.currentDay = currentDay;

    const text = 
      `📝 <b>ПРАКТИЧЕСКОЕ ЗАДАНИЕ</b>\n` +
      `───────────────────────\n` +
      `🎯 <b>Тема дня:</b> <code>День ${currentDay} — ${topicName}</code>\n\n` +
      `✍️ <b>Что нужно сделать:</b>\n` +
      `Выполни практическое задание или напиши предложения по теме утреннего урока.\n\n` +
      `🤖 <i>Отправь готовый текст ответным сообщением прямо сюда. Наш ИИ-учитель мгновенно проверит грамматику и разберет ошибки именно по теме "${topicName}"!</i>`;
    
    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback("❌ Отмена", "action_main_menu")]]).reply_markup
    }).catch((err) => console.log("Текст не изменился, игнорируем"));
  });
};