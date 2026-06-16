/**
 * Глобальный очиститель текста для сообщений Telegram
 */
function sanitizeForTelegram(text) {
  if (!text) return "";
  
  return text
    // 1. Убираем Markdown-жирный и курсив
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    
    // 2. Очищаем содержимое внутри <code> от лишних тегов
    .replace(/<code>([\s\S]*?)<\/code>/gi, (match, content) => {
        const cleanContent = content.replace(/<[^>]*>/g, '');
        return `<code>${cleanContent}</code>`;
    })
    
    // 3. Вырезаем мусорные списки
    .replace(/<\/?ul>/gi, '')     
    .replace(/<\/?ol>/gi, '')     
    .replace(/<li>/gi, '• ')       
    .replace(/<\/li>/gi, '\n')
    
    // 4. Удаляем любые HTML-теги, кроме разрешенных (b, code, i)
    // Это самая мощная защита от ошибок Telegram "Can't find end tag"
    .replace(/<(?!\/?(b|code|i)>)[^>]*>/gi, '');
}

module.exports = { sanitizeForTelegram };