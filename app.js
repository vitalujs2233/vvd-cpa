// Главный контроллер приложения VVD CPA
document.addEventListener("DOMContentLoaded", () => {
    // Инициализируем иконки Lucide на базовом шаблоне
    lucide.createIcons();
    
    // Инициализация менеджера экранов
    ScreenManager.init();
});

const ScreenManager = {
    currentScreen: null,
    
    init() {
        const navButtons = document.querySelectorAll(".nav-item");
        
        navButtons.forEach(btn => {
            btn.addEventListener("click", (e) => {
                const button = e.currentTarget;
                const screenName = button.getAttribute("data-screen");
                
                if (this.currentScreen === screenName) return;
                
                // Эффект вибрации при клике в Telegram
                if (typeof TelegramApp !== 'undefined') {
                    TelegramApp.impact('light');
                }
                
                // Переключение активного класса в меню
                document.querySelector(".nav-item.active")?.classList.remove("active");
                button.classList.add("active");
                
                // Переключение экрана
                this.loadScreen(screenName);
            });
        });
        
        // Загружаем первый экран по умолчанию (Главная)
        this.loadScreen("main");
    },
    
    loadScreen(screenName) {
        this.currentScreen = screenName;
        const container = document.getElementById("screen-container");
        
        // Очищаем контейнер и добавляем класс анимации появления
        container.innerHTML = `<div class="screen-wrapper screen-fade-in" id="screen-${screenName}"></div>`;
        const wrapper = document.getElementById(`screen-${screenName}`);
        
        // Рендерим нужный контент в зависимости от экрана
        switch(screenName) {
            case "main":
                wrapper.innerHTML = `<!-- Контент экрана Главная будет здесь --> <h2 style="font-size:26px; font-weight:700; text-align:center; margin-top:40px;">Экран Главная подгружен</h2>`;
                break;
            case "offers":
                wrapper.innerHTML = `<h2 style="font-size:26px; font-weight:700; text-align:center; margin-top:40px;">Экран Офферы подгружен</h2>`;
                break;
            case "stats":
                wrapper.innerHTML = `<h2 style="font-size:26px; font-weight:700; text-align:center; margin-top:40px;">Экран Статистика подгружен</h2>`;
                break;
            case "chat":
                wrapper.innerHTML = `<h2 style="font-size:26px; font-weight:700; text-align:center; margin-top:40px;">Экран Чат подгружен</h2>`;
                break;
            case "profile":
                wrapper.innerHTML = `<h2 style="font-size:26px; font-weight:700; text-align:center; margin-top:40px;">Экран Профиль подгружен</h2>`;
                break;
        }
        
        // Обновляем динамически добавленные иконки Lucide внутри нового экрана
        lucide.createIcons();
    }
};

