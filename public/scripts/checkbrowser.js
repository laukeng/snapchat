var userAgent = navigator.userAgent.toLowerCase();
var divWarning = document.getElementById("warning");
var divWarningText = document.getElementById("warning-text");
var closeWarning = document.getElementById("close-warning");
closeWarning.addEventListener('click', function() {divWarning.style.display = "none";})
if (userAgent.indexOf("wechat") > -1 || userAgent.indexOf("micromessenger") > -1) {
    divWarningText.innerText = '你正在微信浏览器中运行本应用。如果你想返回微信而不退出群聊，请点击右上角"···"的图标，然后在屏幕下方的菜单中选择“浮窗”将此页面转入后台。在微信主界面右划即可返回此页面。';
    divWarning.style.display = "block";
}
