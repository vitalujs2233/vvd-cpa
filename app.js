/* ==========================================
   VVD CPA
   app.js
========================================== */

"use strict";

/* ==========================================
   ЗАГРУЗКА ПРИЛОЖЕНИЯ
========================================== */

window.onload = () => {

    console.log("VVD CPA Started");

    console.log(App.user);

    loadUser();

    initNavigation();

};

/* ==========================================
   ЗАГРУЗКА ПОЛЬЗОВАТЕЛЯ
========================================== */

function loadUser() {

    const fullName = getFirstName() + " " + getLastName();

    const userId = "ID: " + getUserId();

    const photo = getPhoto();

    // Верхний профиль

    if(document.getElementById("userName"))
        document.getElementById("userName").innerHTML = fullName;

    if(document.getElementById("userId"))
        document.getElementById("userId").innerHTML = userId;

    if(photo && document.getElementById("userAvatar"))
        document.getElementById("userAvatar").src = photo;

    // Карточка пользователя

    if(document.getElementById("homeUserName"))
        document.getElementById("homeUserName").innerHTML = fullName;

    if(document.getElementById("homeUserId"))
        document.getElementById("homeUserId").innerHTML = userId;

    if(photo && document.getElementById("homeAvatar"))
        document.getElementById("homeAvatar").src = photo;

    // Панель администратора

    if(App.isAdmin){

        const admin=document.querySelector(".admin-only");

        if(admin){

            admin.style.display="flex";

        }

    }

}

/* ==========================================
   НАВИГАЦИЯ
========================================== */

function initNavigation(){

    const pages=document.querySelectorAll(".page");

    const buttons=document.querySelectorAll(".tab-button");

    function openPage(pageId){

        pages.forEach(page=>{

            page.classList.remove("active");

        });

        buttons.forEach(button=>{

            button.classList.remove("active");

        });

        const page=document.getElementById(pageId);

        if(page){

            page.classList.add("active");

        }

        const activeButton=document.querySelector(`[data-page="${pageId}"]`);

        if(activeButton){

            activeButton.classList.add("active");

        }

    }

    buttons.forEach(button=>{

        button.addEventListener("click",()=>{

            openPage(button.dataset.page);

        });

    });

    openPage("homePage");

}
/* ==========================================
   ОТКРЫТИЕ КАРТОЧЕК ОФФЕРОВ
========================================== */

document.querySelectorAll(".offer-category").forEach(card => {

    card.addEventListener("click", () => {

        const page = card.dataset.page;

        if (page) {

            openPage(page);

        }

    });

});

/* ==========================================
   КНОПКА НАЗАД
========================================== */

document.querySelectorAll(".back-button").forEach(button => {

    button.addEventListener("click", () => {

        const page = button.dataset.page;

        if (page) {

            openPage(page);

        }

    });

});
