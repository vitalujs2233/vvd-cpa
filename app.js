// ==========================================================================
// VVD CPA — ПОЛНЫЙ ФАЙЛ ЛОГИКИ И НАВИГАЦИИ ДЛЯ ВСЕХ 9 ЭКРАНОВ ШАБЛОНА
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
    // Автоматический запуск роутера при загрузке приложения
    AppRouter.init();
});

const AppRouter = {
    init() {
        // 1. НАВИГАЦИЯ ПО НИЖНЕМУ МЕНЮ (BOTTOM MENU)
        const menuButtons = document.querySelectorAll(".bottom-menu .nav-item");
        
        menuButtons.forEach(btn => {
            btn.addEventListener("click", (e) => {
                const button = e.currentTarget;
                const targetScreenId = button.getAttribute("data-target");
                
                // Переключаем главный экран
                this.switchScreen(targetScreenId);
                
                // Обновляем подсветку иконок в меню (серый -> фиолетовый)
                menuButtons.forEach(b => {
                    b.style.color = "#A5AEC5"; 
                });
                button.style.color = "#9D6BFF"; 
            });
        });

        // 2. АКТИВАЦИЯ ОБРАБОТЧИКОВ ДЛЯ ВНУТРЕННИХ ПОДЭКРАНОВ И КНОПОК «НАЗАД»
        this.bindSubScreens();

        // 3. АКТИВАЦИЯ ИНТЕРАКТИВНЫХ ФУНКЦИЙ (ГЕНЕРАЦИЯ ССЫЛОК И СИМУЛЯТОР ЧАТА)
        this.bindOffersAndChat();
    },

    // Функция переключения видимости экранов
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
            // Даем микрозадержку для корректного срабатывания плавного CSS-появления
            setTimeout(() => {
                targetScreen.classList.add("active");
            }, 10);
        }
        
        // Автоматически скроллим вверх, чтобы контент не открывался «снизу»
        window.scrollTo(0, 0);
    },

    // Логика кликов по кнопкам внутри экранов и переходов «Назад»
    bindSubScreens() {
        // Клик по тексту "История лога" на Главной переключает на вкладку Статистики
        const historyLink = document.getElementById("link-to-stats-history");
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

        // Симуляция клика по кнопке "Заказать выплату"
        document.getElementById("btn-do-withdraw")?.addEventListener("click", () => {
            alert("Заявка на вывод средств успешно создана! Статус можно отслеживать в логе выплат.");
            this.switchScreen("screen-profile");
        });

        // Симуляция клика по кнопке "Сохранить конфигурацию"
        document.getElementById("btn-save-settings")?.addEventListener("click", () => {
            alert("Конфигурация профиля успешно обновлена.");
            this.switchScreen("screen-profile");
        });
    },

    // Логика получения ссылок SmartLink и живой отправки сообщений в поддержку
    bindOffersAndChat() {
        // --- РАЗДЕЛ ОФФЕРОВ ---
        const offerButtons = document.querySelectorAll("#screen-offers .vvd-btn-get");
        
        offerButtons.forEach((btn, index) => {
            btn.addEventListener("click", (e) => {
                const card = e.currentTarget.parentElement;
                
                // Удаляем кнопку "Получить SmartLink"
                e.currentTarget.remove();
                
                // Создаем стеклянный контейнер для вывода сгенерированной ссылки
                const linkBox = document.createElement("div");
                linkBox.style.display = "flex";
                linkBox.style.gap = "8px";
                linkBox.style.marginTop = "12px";
                
                // Добавляем инпут со ссылкой
                const input = document.createElement("input");
                input.type = "text";
                input.value = `https://vvd.cpa{index + 1}`;
                input.readOnly = true;
                input.style.width = "100%";
                input.style.height = "48px";
                input.style.background = "rgba(255,255,255,0.02)";
                input.style.border = "1px solid rgba(255,255,255,0.08)";
                input.style.borderRadius = "14px";
                input.style.padding = "0 12px";
                input.style.color = "#1EEA7A";
                input.style.fontSize = "13px";
                input.style.outline = "none";
                
                // Добавляем кнопку "Копировать"
                const copyBtn = document.createElement("button");
                copyBtn.innerHTML = "Копировать";
                copyBtn.style.height = "48px";
                copyBtn.style.padding = "0 14px";
                copyBtn.style.background = "rgba(123, 77, 255, 0.12)";
                copyBtn.style.border = "1px solid rgba(123, 77, 255, 0.25)";
                copyBtn.style.borderRadius = "14px";
                copyBtn.style.color = "#9D6BFF";
                copyBtn.style.fontWeight = "600";
                copyBtn.style.cursor = "pointer";
                copyBtn.style.fontSize = "13px";
                
                // Копирование по клику
                copyBtn.addEventListener("click", () => {
                    navigator.clipboard.writeText(input.value);
                    alert("Ваша персональная ссылка SmartLink успешно скопирована!");
                });
                
                linkBox.appendChild(input);
                linkBox.appendChild(copyBtn);
                card.appendChild(linkBox);
            });
        });

        // --- РАЗДЕЛ ТЕХПОДДЕРЖКИ (ЖИВОЙ ЧАТ) ---
        const sendBtn = document.getElementById("btn-send-msg");
        const inputField = document.getElementById("chat-input-field");
        const chatBox = document.getElementById("chat-box");

        if (sendBtn && inputField && chatBox) {
            const sendMessage = () => {
                const text = inputField.value.trim();
                if (!text) return;

                // Отрендерить сообщение пользователя
                const userMessage = document.createElement("div");
                userMessage.style.maxWidth = "80%";
                userMessage.style.padding = "12px 16px";
                userMessage.style.background = "#7B4DFF"; // Премиум фиолетовый
                userMessage.style.alignSelf = "flex-end";
                userMessage.style.borderRadius = "18px";
                userMessage.style.borderBottomRightRadius = "4px";
                userMessage.style.display = "flex";
                userMessage.style.flexDirection = "column";
                userMessage.style.gap = "4px";

                userMessage.innerHTML = `
                    <div style="font-size: 14px; line-height: 1.4; color: #fff;">${text}</div>
                    <div style="font-size: 10px; opacity: 0.6; align-self: flex-end;">Сейчас</div>
                `;

                chatBox.appendChild(userMessage);
                inputField.value = ""; // Очистка поля
                chatBox.scrollTop = chatBox.scrollHeight; // Скролл вниз

                // Имитация мгновенного ответа личного менеджера через 1.2 секунды
                setTimeout(() => {
                    const managerMessage = document.createElement("div");
                    managerMessage.style.maxWidth = "80%";
                    managerMessage.style.padding = "12px 16px";
                    managerMessage.style.background = "rgba(255,255,255,0.04)";
