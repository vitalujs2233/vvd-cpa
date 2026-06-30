document.querySelectorAll('.bottom button').forEach(b=>b.onclick=()=>{
document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
document.getElementById(b.dataset.page).classList.add('active');
});

