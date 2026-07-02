/* ==========================================
   VVD CPA
   app.js
========================================== */

"use strict";

window.onload=()=>{

    console.log("VVD CPA Started");

    console.log(App.user);

    document.getElementById("userName").innerHTML=

        getFirstName()+" "+getLastName();

    document.getElementById("userId").innerHTML=

        "ID: "+getUserId();

    if(getPhoto()){

        document.getElementById("userAvatar").src=

        getPhoto();

    }
document.getElementById("homeUserName").innerHTML =

    getFirstName() + " " + getLastName();

document.getElementById("homeUserId").innerHTML =

    "ID: " + getUserId();

if(getPhoto()){

    document.getElementById("homeAvatar").src =

        getPhoto();

}
    if(App.isAdmin){

        document

        .querySelector(".admin-only")

        .style.display="flex";

    }

};
/* ==========================================
   НАВИГАЦИЯ ПО ЭКРАНАМ
========================================== */

const pages = document.querySelectorAll(".page");

const tabs = document.querySelectorAll(".tab-button");

function openPage(pageId){

    pages.forEach(page=>{

        page.classList.remove("active");

    });

    tabs.forEach(tab=>{

        tab.classList.remove("active");

    });

    document
        .getElementById(pageId)
        .classList
        .add("active");

    document
        .querySelector(`[data-page="${pageId}"]`)
        .classList
        .add("active");

}
/* ==========================================
   ОБРАБОТКА НАЖАТИЯ НА ВКЛАДКИ
========================================== */

tabs.forEach(tab=>{

    tab.addEventListener("click",()=>{

        const pageId = tab.dataset.page;

        openPage(pageId);

    });

});
/* ==========================================
   ПЕРВАЯ ЗАГРУЗКА
========================================== */

openPage("homePage");





