const { GoogleGenAI } = require("@google/genai");

// Поддерживаем оба варианта написания из .env ради безопасности
const rawKeys = process.env.GEMINI_KEYS || process.env.GEMINI_API_KEYS || "";

const apiKeys = rawKeys
  ? rawKeys.split(",").map(k => k.trim()).filter(k => k.length > 0)
  : (process.env.GEMINI_API_KEY ? [process.env.GEMINI_API_KEY.trim()] : []);

let currentKeyIndex = 0;

if (apiKeys.length === 0) {
  console.error("❌ [Gemini Pool] Критическая ошибка: Ключи ИИ не найдены в переменной окружения .env!");
} else {
  console.log("⚡ [Gemini Pool] Сервер успешно запустил пул ротации. Доступно ключей: " + apiKeys.length);
}

/**
 * Функция берет следующий ключ из пула (ротация между разными аккаунтами)
 */
function getNextAIInstance() {
  if (apiKeys.length === 0) {
    throw new Error("Массив API-ключей Gemini пуст. Проверь конфигурацию .env");
  }
  const apiKey = apiKeys[currentKeyIndex];
  return { apiKey, index: currentKeyIndex };
}

/**
 * Умный метод генерации с авто-повтором и сменой ключей при ошибке 429
 */
async function generateContentWithRetry(options, retries = apiKeys.length || 4, baseDelay = 3000) {
  let lastError = null;
  // Если ключ всего один, даем системе сделать хотя бы 3 попытки на случай сетевого сбоя
  const actualRetries = apiKeys.length === 1 ? 3 : retries;

  for (let attempt = 1; attempt <= actualRetries; attempt++) {
    // Получаем текущий активный инстанс и его реальный индекс в массиве
    const currentAI = getNextAIInstance(); 
    
    try {
      const ai = new GoogleGenAI({ apiKey: currentAI.apiKey });
      const response = await ai.models.generateContent({
        model: options.model || "gemini-2.0-flash",
        contents: options.contents,
        config: options.config || {}
      });
      
      // Если запрос прошёл успешно, плавно сдвигаем очередь на следующий ключ для будущего юзера
      currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
      return response;

    } catch (error) {
      lastError = error;
      const errorMsg = error.message || "";
      const isRateLimit = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED");

      // Если поймали лимит и попытки еще есть — сдвигаем индекс и уходим на паузу
      if (isRateLimit && attempt < actualRetries) {
        const delay = baseDelay * attempt;
        
        console.warn("[Gemini Pool] Ключ на индексе " + currentAI.index + " поймал лимит 429. Попытка " + attempt + "/" + actualRetries + ". Сдвигаем пул и спим " + delay + "мс...");
        
        // Переключаем на следующий ключ прямо сейчас, чтобы следующая попытка пошла с нового аккаунта
        currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
        
        await new Promise(resolve => setTimeout(resolve, delay));
        continue; 
      }

      // Если ошибка не связана с лимитами (например, косяк в структуре промпта), нет смысла гонять пул дальше
      throw error;
    }
  }
  
  throw new Error("Все доступные ключи Gemini из пула вернули ошибку 429. Последний лог: " + lastError.message);
}

module.exports = { generateContentWithRetry };