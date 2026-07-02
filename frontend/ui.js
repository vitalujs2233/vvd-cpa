/* ============================================
   VVD CPA
   ui.js
============================================ */

"use strict";

// ===========================================
// Элементы
// ===========================================

const pages = document.querySelectorAll(".page");
const navButtons = document.querySelectorAll(".nav-button");

const loader = document.getElementById("loader");

const toast = document.getElementById("toast");
const toastText = document.getElementById("toastText");

const withdrawModal = document.getElementById("withdrawModal");
const linkModal = document.getElementById("linkModal");

const withdrawButton = document.getElementById("withdrawButton");

const closeWithdrawModal =
document.getElementById("closeWithdrawModal");

const closeLinkModal =
document.getElementById("closeLinkModal");

// ===========================================
// Loader
// ===========================================

function hideLoader(){

    if(!loader) return;

    loader.style.display = "none";

}

// ===========================================
// Toast
// ===========================================

function showToast(message){

    if(!toast) return;

    toastText.innerText = message;

    toast.classList.add("show");

    setTimeout(()=>{

        toast.classList.remove("show");

    },2500);

}

// ===========================================
// Pages
// ===========================================

function openPage(page){

    pages.forEach(item=>{

        item.classList.remove("active");

    });

    navButtons.forEach(item=>{

        item.classList.remove("active");

    });

    document
        .getElementById(page)
        .classList
        .add("active");

    document
        .querySelector(`[data-page="${page}"]`)
        .classList
        .add("active");

}

// ===========================================
// Bottom Menu
// ===========================================

navButtons.forEach(button=>{

    button.onclick=()=>{

        openPage(button.dataset.page);

    }

});

// ===========================================
// Withdraw Modal
// ===========================================

if(withdrawButton){

withdrawButton.onclick=()=>{

withdrawModal.classList.add("active");

};

}

if(closeWithdrawModal){

closeWithdrawModal.onclick=()=>{

withdrawModal.classList.remove("active");

};

}

// ===========================================
// Link Modal
// ===========================================

if(closeLinkModal){

closeLinkModal.onclick=()=>{

linkModal.classList.remove("active");

};

}

// ===========================================
// Закрытие по клику
// ===========================================

window.onclick=(e)=>{

if(e.target===withdrawModal){

withdrawModal.classList.remove("active");

}

if(e.target===linkModal){

linkModal.classList.remove("active");

}

};

// ===========================================
// Copy
// ===========================================

const copyButton=document.getElementById("copyLinkButton");

if(copyButton){

copyButton.onclick=()=>{

const input=document.getElementById("offerLink");

navigator.clipboard.writeText(input.value);

showToast("Ссылка скопирована");

};

}

// ===========================================
// Start
// ===========================================

window.addEventListener("load",()=>{

setTimeout(()=>{

hideLoader();

},800);

});
