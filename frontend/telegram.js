if(window.Telegram&&Telegram.WebApp){
Telegram.WebApp.ready();
Telegram.WebApp.expand();
const u=Telegram.WebApp.initDataUnsafe.user;
if(u){
document.getElementById('username').textContent=u.first_name;
if(u.photo_url)document.getElementById('avatar').src=u.photo_url;
}
}

