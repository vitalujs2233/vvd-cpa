/* ========================================== VVD CPA app.js
========================================== */

“use strict”;

let pages = []; let tabButtons = [];

window.onload = () => {

    console.log("VVD CPA Started");
    console.log(App.user);

    loadUser();

    pages = document.querySelectorAll(".page");
    tabButtons = document.querySelectorAll(".tab-button");

    initNavigation();
    initOfferNavigation();

    openPage("homePage");

};

function loadUser() {

    const fullName = getFirstName() + " " + getLastName();
    const userId = "ID: " + getUserId();
    const photo = getPhoto();

    if(document.getElementById("userName"))
        document.getElementById("userName").innerHTML = fullName;

    if(document.getElementById("userId"))
        document.getElementById("userId").innerHTML = userId;

    if(photo && document.getElementById("userAvatar"))
        document.getElementById("userAvatar").src = photo;

    if(document.getElementById("homeUserName"))
        document.getElementById("homeUserName").innerHTML = fullName;

    if(document.getElementById("homeUserId"))
        document.getElementById("homeUserId").innerHTML = userId;

    if(photo && document.getElementById("homeAvatar"))
        document.getElementById("homeAvatar").src = photo;

    const admin = document.querySelector(".admin-only");
    if(App.isAdmin && admin){
        admin.style.display = "flex";
    }

}

function openPage(pageId){

    pages.forEach(page => page.classList.remove("active"));
    tabButtons.forEach(btn => btn.classList.remove("active"));

    const page = document.getElementById(pageId);
    if(page) page.classList.add("active");

    const tab = document.querySelector('.tab-button[data-page="' + pageId + '"]');
    if(tab) tab.classList.add("active");

}

function initNavigation(){

    tabButtons.forEach(button => {

        button.addEventListener("click", () => {

            openPage(button.dataset.page);

        });

    });

}

function initOfferNavigation(){

    document.querySelectorAll(".offer-category").forEach(card => {

        card.addEventListener("click", () => {

            const page = card.dataset.page;

            if(page){
                openPage(page);
            }

        });

    });

    document.querySelectorAll(".back-button").forEach(button => {

        button.addEventListener("click", () => {

            const page = button.dataset.page;

            if(page){
                openPage(page);
            }

        });

    });

}
