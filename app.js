/* ==========================================
   VVD CPA
   app.js
========================================== */

"use strict";

window.onload = () => {

    console.log("VVD CPA Started");
    console.log(App.user);

    /* ---------- Верхняя карточка ---------- */

    document.getElementById("userName").innerHTML =
        getFirstName() + " " + getLastName();

    document.getElementById("userId").innerHTML =
        "ID: " + getUserId();

    if (getPhoto()) {
        document.getElementById("userAvatar").src = getPhoto();
    }

    /* ---------- Главная карточка ---------- */

    const homeName = document.getElementById("homeUserName");
    const homeId = document.getElementById("homeUserId");
    const homeAvatar = document.getElementById("homeAvatar");

    if (homeName) {
        homeName.innerHTML = getFirstName() + " " + getLastName();
    }

    if (homeId) {
        homeId.innerHTML = "ID: " + getUserId();
    }

    if (homeAvatar && getPhoto()) {
        homeAvatar.src = getPhoto();
    }

    /* ---------- Админ ---------- */

    if (App.isAdmin) {

        const admin = document.querySelector(".admin-only");

        if (admin) {
            admin.style.display = "flex";
        }

    }

    /* ==========================================
       НАВИГАЦИЯ
    ========================================== */

    const pages = document.querySelectorAll(".page");
    const tabs = document.querySelectorAll(".tab-button");

    function openPage(pageId) {

        pages.forEach(page => {
            page.classList.remove("active");
        });

        tabs.forEach(tab => {
            tab.classList.remove("active");
        });

        const page = document.getElementById(pageId);

        if (page) {
            page.classList.add("active");
        }

        const activeTab = document.querySelector(`[data-page="${pageId}"]`);

        if (activeTab) {
            activeTab.classList.add("active");
        }

    }

    tabs.forEach(tab => {

        tab.addEventListener("click", () => {

            openPage(tab.dataset.page);

        });

    });

    /* ---------- Открываем главную ---------- */

    openPage("homePage");

};
