// ==========================================================================
// VVD CPA — ПОЛНЫЙ ДЕМО-ДВИЖОК ДЛЯ НАВИГАЦИИ ПО ВСЕМ ЭКРАНАМ МАКЕТА
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
    // Мгновенная инициализация кликов и навигации при старте шаблона
    VvdAppEngine.init();
});

const VvdAppEngine = {
    init() {
        // Находим интерактивные кнопки в нижнем меню навигации
        const navButtons = document.querySelectorAll(".bottom-menu .nav-item");
        
        navButtons.forEach(btn => {
            btn.addEventListener("click", (e) => {
                const clickedButton = e.currentTarget;
                const targetScreenName = clickedButton.getAttribute("data-target");
                
                // Переключаем активное состояние экранов
                this.changeActiveScreen(targetScreenName);
                
                // Сбрасываем стили подсветки кнопок меню и красим только нажатую в премиум фиолетовый
                navButtons.forEach(b => b.style.color = "#A5AEC5");
                clickedButton.style.color = "#9D6BFF";
            });
        });

        // Подключаем переходы для внутренних глубоких подэкранов и возвратов назад
        this.initSubNavigation();
    },

    changeActiveScreen(screenId) {
        // Находим абсолютно все экраны в разметке и принудительно скрываем их
        const screens = document.querySelectorAll("#screens-root .screen");
        screens.forEach(s => {
            s.style.display = "none";
            s.classList.remove("active");
        });

        // Находим целевой экран по его ID и открываем его визуально на дисплее
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.style.display = "block";
            // Даем микрозадержку для плавного срабатывания анимации CSS
            setTimeout(() => {
                targetScreen.classList.add("active");
            }, 10);
        }
        
        // Сбрасываем скролл на самый верх страницы
        window.scrollTo(0, 0);
    },

    initSubNavigation() {
        // Ссылка "История лога" на Главной странице мгновенно перекидывает на вкладку Статистики
        document.getElementById("link-to-stats-history")?.addEventListener("click", () => {
            document.querySelector(".bottom-menu [data-target='screen-stats']").click();
        });

        // Клик по любому логу выплат в Статистике плавно открывает Квитанцию (Экран 6.2)
        document.querySelectorAll("#screen-stats .payout-history-item").forEach(item => {
            item.addEventListener("click", () => this.changeActiveScreen("screen-payout-detail"));
        });

        // Переходы из главного экрана Профиля во внутренние разделы
        document.getElementById("p-btn-withdraw")?.addEventListener("click", () => this.changeActiveScreen("screen-withdraw"));
        document.getElementById("p-btn-settings")?.addEventListener("click", () => this.changeActiveScreen("screen-settings"));
        document.getElementById("p-btn-admin")?.addEventListener("click", () => this.changeActiveScreen("screen-admin"));

        // Логика возвратов по кнопкам «Назад»
        document.getElementById("back-withdraw")?.addEventListener("click", () => this.changeActiveScreen("screen-profile"));
        document.getElementById("back-settings")?.addEventListener("click", () => this.changeActiveScreen("screen-profile"));
        document.getElementById("back-admin")?.addEventListener("click", () => this.changeActiveScreen("screen-profile"));
        document.getElementById("back-payout-detail")?.addEventListener("click", () => this.changeActiveScreen("screen-stats"));

        // Кнопка сохранения настроек и возврата
        document.getElementById("btn-save-settings")?.addEventListener("click", () => {
            alert("Конфигурация успешно обновлена!");
            this.changeActiveScreen("screen-profile");
        });

        // Кнопка симуляции заказа выплаты средств
        document.getElementById("btn-do-withdraw")?.addEventListener("click", () => {
            alert("Заявка на выплату средств успешно отправлена!");
            this.changeActiveScreen("screen-profile");
        });
        
        // Оживляем кнопки "Получить SmartLink" на вкладке Офферы
        document.querySelectorAll("#screen-offers .vvd-btn-get").forEach((btn, index) => {
            btn.addEventListener("click", (e) => {
                const card = e.currentTarget.parentElement;
                e.currentTarget.remove(); // Удаляем кнопку
                
                // Генерируем красивую строку инпута со ссылкой для копирования
                const container = document.createElement("div");
                container.style.display = "flex";
                container.style.gap = "8px";
                container.style.marginTop = "12px";
                container.innerHTML = `
                    <input type="text" value="https://vvd.cpa{index + 1}" readonly style="width:100%; height:48px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:0 12px; color:#1EEA7A; outline:none; font-size:13px;">
                    <button class="copy-trigger" style="height:48px; padding:0 14px; background:rgba(123,77,255,0.15); border:1px solid rgba(123,77,255,0.3); border-radius:14px; color:#9D6BFF; font-weight:600; cursor:pointer; font-size:13px;">Копировать</button>
                `;
                container.querySelector(".copy-trigger").addEventListener("click", (ev) => {
                    navigator.clipboard.writeText(container.querySelector("input").value);
                    alert("Ссылка скопирована!");
                });
                card.appendChild(container);
            });
        });
    }
};
