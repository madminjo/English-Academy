const { Markup } = require("telegraf");

module.exports = (bot) => {
  const showToday = async (ctx) => {
    if (ctx.callbackQuery) await ctx.answerCbQuery();

    // 1. Определяем язык (по умолчанию English)
    const lang = ctx.session.lang || 'en';
    
    // 2. Структура контента в зависимости от языка
    const content = {
      en: {
        title: "📖 LESSON OF THE DAY: Day 1",
        grammar: "Grammar: English Alphabet & Sounds",
        vocab: "New Words",
        words: "• Apple — Apple\n• Book — Book\n• Code — Programming",
        reading: "Reading: A short story about a coder...",
        task: "Practical Task: Write 5 simple sentences about yourself!",
        btn: "✅ Complete Task",
        back: "⬅️ Back to Menu"
      },
      de: {
        title: "📖 Lektion des Tages: Tag 1",
        grammar: "Grammatik: Das deutsche Alphabet",
        vocab: "Neue Wörter",
        words: "• Apfel — Apfel\n• Buch — Buch\n• Code — Programmieren",
        reading: "Lesen: Eine kurze Geschichte über einen Coder...",
        task: "Praktische Aufgabe: Schreibe 5 einfache Sätze über dich!",
        btn: "✅ Aufgabe erledigen",
        back: "⬅️ Zurück zum Menü"
      }
    };

    const data = content[lang];

    const lessonText = 
      `<b>${data.title}</b>\n` +
      `───────────────────────\n` +
      `📚 <b>${data.grammar}</b>\n\n` +
      `🆕 <b>${data.vocab}:</b>\n` +
      `${data.words}\n\n` +
      `📖 <b>${data.reading}</b>\n\n` +
      `📝 <b>${data.task}</b>`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(data.btn, "action_task")],
      [Markup.button.callback(data.back, "action_main_menu")]
    ]);

    if (ctx.callbackQuery) {
      await ctx.editMessageText(lessonText, { parse_mode: "HTML", ...keyboard });
    } else {
      await ctx.replyWithHTML(lessonText, keyboard);
    }
  };

  bot.command("today", showToday);
  bot.action("action_today", showToday);
};