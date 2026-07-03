// Модуль интеграции с Telegram WebApp API
const tg = window.Telegram?.WebApp;

const TelegramApp = {
    init() {
        if (!tg) {
            console.warn("Telegram WebApp SDK не обнаружен. Запущено в режиме браузера.");
            return;
        }
        
        // Расширяем на весь экран и фиксируем
        tg.expand();
        tg.ready();
        
        // Настройка цветов интерфейса в самом Telegram
        tg.setHeaderColor('#070A14');
        tg.setBackgroundColor('#070A14');
        
        // Включаем подтверждение закрытия для предотвращения случайных свайпов
        tg.enableClosingConfirmation();
        
        console.log("Telegram WebApp успешно инициализирован под аккаунтом:", tg.initDataUnsafe?.user?.username);
    },
    
    // Премиальная вибрация при кликах (Taptic Engine)
    impact(style = 'light') {
        if (tg?.HapticFeedback) {
            tg.HapticFeedback.impactOccurred(style);
        }
    },
    
    // Вибрация успеха (для вывода средств, копирования ссылок)
    notification(type = 'success') {
        if (tg?.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred(type);
        }
    },
    
    // Получение данных пользователя
    getUserData() {
        return tg?.initDataUnsafe?.user || {
            first_name: "John",
            last_name: "Doe",
            username: "johndoe_demo",
            id: 12345678
        };
    }
};

// Запуск инициализации при загрузке скрипта
TelegramApp.init();

