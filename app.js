// ==========================================================================
// VVD CPA — НАВИГАЦИЯ, ВНУТРЕННИЕ ПЕРЕХОДЫ И КНОПКИ «НАЗАД»
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
    // Автоматический запуск менеджера навигации при загрузке приложения
    AppRouter.init();
});

const AppRouter = {
    // Инициализация всех обработчиков кликов
    init() {
        // 1. НАВИГАЦИЯ ПО НИЖНЕМУ МЕНЮ (BOTTOM MENU)
        const menuButtons = document.querySelectorAll(".bottom-menu .nav-item");
        
        menuButtons.forEach(btn => {
            btn.addEventListener("click", (e) => {
                const button = e.currentTarget;
                const targetScreenId = button.getAttribute("data-target");
                
                // Переключаем главный экран
                this.switchScreen(targetScreenId);
                
                // Обновляем подсветку иконок (серый -> фиолетовый)
                menuButtons.forEach(b => {
                    b.style.color = "#A5AEC5"; 
                });
                button.style.color = "#9D6BFF"; 
            });
        });

        // 2. ЗАПУСК ОБРАБОТЧИКОВ ДЛЯ ВНУТРЕННИХ ПОДЭКРАНОВ И КНОПОК «НАЗАД»
        this.bindSubScreens();
    },

    // Функция показа нужного экрана и скрытия остальных
    switchScreen(screenId) {
        // Находим и скрываем вообще все экраны в корневом контейнере
        const allScreens = document.querySelectorAll("#screens-root .screen");
        allScreens.forEach(screen => {
            screen.style.display = "none";
            screen.classList.remove("active");
        });

        // Отображаем тот экран, на который нажали
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.style.display = "block";
            // Даем микрозадержку, чтобы CSS-анимация плавного появления сработала корректно
            setTimeout(() => {
                targetScreen.classList.add("active");
            }, 10);
        }
        
        // Автоматически скроллим вверх, чтобы пользователь не оставался внизу страницы
        window.scrollTo(0, 0);
    },

    // Логика кликов по кнопкам внутри экранов и переходов «Назад»
    bindSubScreens() {
        // Клик по тексту "История" на Главной переключает на вкладку Статистики
        const historyLink = document.querySelector("#screen-main .section-link");
        if (historyLink) {
            historyLink.addEventListener("click", () => {
                const statsTabButton = document.querySelector(".bottom-menu [data-target='screen-stats']");
                if (statsTabButton) statsTabButton.click();
            });
        }

        // Клик по строкам выплат в Статистике открывает Подэкран 6.2 (Детали выплаты)
        const payoutItems = document.querySelectorAll("#screen-stats .payout-history-item");
        payoutItems.forEach(item => {
            item.addEventListener("click", () => {
                this.switchScreen("screen-payout-detail");
            });
        });

        // --- Внутренние переходы из вкладки Профиль ---
        // Клик по пункту "Вывод средств" -> открывает Экран 6
        document.getElementById("p-btn-withdraw")?.addEventListener("click", () => {
            this.switchScreen("screen-withdraw");
        });

        // Клик по пункту "Настройки профиля" -> открывает Экран 8
        document.getElementById("p-btn-settings")?.addEventListener("click", () => {
            this.switchScreen("screen-settings");
        });

        // Клик по пункту "Админ-панель" -> открывает Экран 9
        document.getElementById("p-btn-admin")?.addEventListener("click", () => {
            this.switchScreen("screen-admin");
        });

        // --- Действия для всех кнопок «Назад» (Возвраты) ---
        // Из деталей выплаты возвращаемся назад на экран Статистики
        document.getElementById("back-payout-detail")?.addEventListener("click", () => {
            this.switchScreen("screen-stats");
        });

        // Из формы вывода средств возвращаемся назад в Профиль
        document.getElementById("back-withdraw")?.addEventListener("click", () => {
            this.switchScreen("screen-profile");
        });

        // Из настроек возвращаемся назад в Профиль
        document.getElementById("back-settings")?.addEventListener("click", () => {
            this.switchScreen("screen-profile");
        });

        // Из админ-панели возвращаемся назад в Профиль
        document.getElementById("back-admin")?.addEventListener("click", () => {
            this.switchScreen("screen-profile");
        });
    }
};
