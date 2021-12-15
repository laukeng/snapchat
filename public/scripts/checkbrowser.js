var userAgent = navigator.userAgent.toLowerCase();
var divWarning = document.getElementById("tip");
var divWarningText = document.getElementById("tip-text");
var closeWarning = document.getElementById("close-tip");
//localStorage.setItem("tipRead", '');
closeWarning.addEventListener('click', function () {
    divWarning.style.display = "none";
    localStorage.setItem("tipRead", 'yes');
});
if (!localStorage.getItem('tipRead')) {
    if (userAgent.indexOf("wechat") > -1 || userAgent.indexOf("micromessenger") > -1) {
        divWarningText.innerText = '你正在微信浏览器中运行本应用。如果你想返回微信而不退出群聊，请点击右上角"···"的图标，然后在屏幕下方的菜单中选择“浮窗”将此页面转入后台。在微信主界面右划即可返回此页面。如果你需要经常使用此应用，请选择“收藏”或者“在浏览器打开”。';
        divWarning.style.display = "block";
    } else if (userAgent.indexOf("safari") > -1 && userAgent.indexOf("android") < 0) {
        divWarningText.innerText = '如果你使用的是IOS的Safari浏览器，你可以点击右上角的分享图标，然后将此应用添加到主屏幕，以方便下次快速访问本应用。';
        divWarning.style.display = "block";
    } else if (userAgent.indexOf("android") > -1 && (userAgent.indexOf("firefox") > -1 || userAgent.indexOf("chrome") > -1)) {
        divWarningText.innerText = '如果你使用的是安卓版的Firefox或者Chrome浏览器，你可以在浏览器菜单中选择“添加到主屏幕”，以方便下次快速访问本应用。（此操作需要你的浏览器具有“添加桌面快捷方式”的权限）';
        divWarning.style.display = "block";
    };
}