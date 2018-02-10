先强调一遍，是扩展！扩展！扩展！不是插件！

在上一篇文章中，主要稍微地从肤浅的层面对比了一下各种浏览器，但是实际上并没有扯到浏览器最终要的属性——用户体验。用户体验可以包含很多方面的因素，比如UI、性能、稳定性、功能、配置要求等等等等,今天我们就来讲一下功能方面Chrome给我们带来的绝赞体验——有请可爱的扩展们！

给大爷们介绍各位扩展之前，我们先到野生扩展们的卧室参观一下。点击Chrome左边、地址栏下方的应用标签，然后进入网上应用店，我们就可以找到各式各样的扩展&&主题，你可以自己在里面找些对电波的带回家<del>200円一次</del>。那今天就先介绍些我常用的扩展啦～

（顺带一提，尽管google.com早已被屏蔽，但是咕果的一些二级域名却没有，或者说不完全被屏蔽，比如咕果地图和chrome.google.com等，如果在你的地区很不巧不能上chrome应用商店的话，你就只能利用一些不能说的科技了，或者使用一些国内的镜像资源，比如www.gugeapps.com）

***uBlock Origin***

[uBlock](https://chrome.google.com/webstore/detail/ublock-origin/cjpalhdlnbpafiamejdnhcphjbkeiagm?utm_source=chrome-ntp-icon)是一款流行的浏览器去广告扩展，在各大浏览器商店(Chrome,Firefox,Edge)上都可以找到，同类软件中，在前有他的前辈ABP（AdBlockPlus），在后有他的兄弟uMatrix.与ABP相比，他的性能和占用情况更令人满意（参考[uBlock vs. ABP](https://github.com/gorhill/uBlock/wiki/uBlock-vs.-ABP:-efficiency-compared)）;与uMatrix相比，他的功能显得没有那么强大，但是却有开箱即用的优秀体验。上两张对比图：

![](https://i.yusa.me/KyvvyloqBEOG.jpg)

Before(还有无穷无尽的弹窗特效截不出来）

![](https://i.yusa.me/XJgv33M8yjj3.jpg)

After

仔细观察两张图你会发现After怎么还少了些不是广告的元素？比如那两个按钮，“点击收藏本站”和“建议留言板”，其实只是因为我看不顺眼所以就屏蔽了。没错，除了屏蔽广告以外你还可以自定义屏蔽任何元素，来定制你想要的网站！（等会要出场的Stylish:诶诶诶？？）另外，uBlock也可以帮你屏蔽一些挖矿脚本等，防止你的CPU被人偷走。

Tampermonkey

[Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo?utm_source=chrome-ntp-icon)是最有名的userscript扩展之一了，同类扩展还有Greasemonkey等,在安装了Tampermonkey之后，你就可以去[greasefork](https://greasyfork.org/zh-CN)和[OpenUserJS](https://openuserjs.org/)等网站安装你需要的脚本。具体来说呢，你可以安装：

[EX-百度云盘](https://greasyfork.org/zh-CN/scripts/26638-ex-%E7%99%BE%E5%BA%A6%E4%BA%91%E7%9B%98)，来获取百度云的直链直接下载大文件从而避免安装百度云客户端这个毒瘤。关于用法我之前应该有写过，有兴趣可以翻一下。

[Google_Baidu_Swicher](https://openuserjs.org/install/t3xtf0rm4tgmail.com/Google_baidu_Switcher_(ALL_in_One).user.js),在百度和咕果的搜索栏右侧各添加一个按钮，在咕果的结果不让你满意时一键跳转为百度搜索，弥补两方的不足。（其实一般都不会从咕果往百度跳的啦）

[Super_Preloader_One](https://greasyfork.org/scripts/10433-super-preloaderplus-one/code/Super_preloaderPlus_one.user.js)，提前帮你加载下一页来帮你省下点击下一页的力气，而且是将下一页直接拼接在下方，如果是在论坛爬高楼简直不要更好用。

[购物党比价](https://greasyfork.org/scripts/14466-%E8%B4%AD%E7%89%A9%E5%85%9A%E6%AF%94%E4%BB%B7%E5%B7%A5%E5%85%B7/code/%E8%B4%AD%E7%89%A9%E5%85%9A%E6%AF%94%E4%BB%B7%E5%B7%A5%E5%85%B7.user.js)，在你逛淘宝京东的时候自动在商品页显示最近的价格趋势和同类商品推荐，虽然不一定准确，但是好歹能让你对现在的价格是真打折还是假打折、是不是历史最低有一点底。同类的还有惠惠购物助手等。

***Vimium***

[Vimium](https://chrome.google.com/webstore/detail/vimium/dbepggeogbaibhgnhhndojpepiihcmeb?utm_source=chrome-ntp-icon)是一款帮助你摆脱鼠标、全靠键盘上网的扩展，没错，从名字你也可以看出他跟Vim一脉相承的关系，很多快捷键都继承自Vim，比如用JKHL来上下左右移动（不过也有些不同，比如Vimium中向下大跳是d，搞得我用Vim的时候经常收都就dd删了一行hh），而他的学习曲线比Vim还是和缓很多，但是和Vim一样，都属于你一开始会很不习惯，但是习惯之后就变成它们的形状回不到过去了的那种。顺带一提，尽管有人说Vimium在ff上也是有的，但是我试了一下在ff57上并没有找到可用的版本。

***Stylish***

[Stylish](https://chrome.google.com/webstore/detail/stylish-custom-themes-for/fjnbnpbmkenffdnngjfgmeleoegfcffe?utm_source=chrome-ntp-icon)是一款可自定义网页样式的扩展。什么叫网页样式？多的不说了，是骡子是马来两张图瞅瞅。

![](https://i.yusa.me/R78YgnLPmaMR.jpg)
Before

![https://i.yusa.me/azLleqvamYv8.jpg]
After

***一键管理所有扩展***

Chrome经常被人诟病的一点就是她的内存占用了，虽然Chrome对内存的需求确实非常大，但自己对扩展和标签的管理也是非常重要的，否则就真的是内存无底洞了。[这款扩展](https://chrome.google.com/webstore/detail/niemebbfnfbjfojajlmnbiikmcpjkkja?utm_source=chrome-app-launcher-info-dialog)的目的就是帮你方便地禁用/启用各种扩展，防止一些只需要在特定网页启用的扩展一直吃着你的内存。

***SwitchyOmega***

这个大概不需要多介绍了吧，知道的都会用，不知道的也用不上emm。配合各类socks,http,https代理以及gfwlist/whitelist食用。

***Postman***

好用的http抓包扩展，写爬虫的时候配合F12超好用der。

其他可爱的扩展们，就等着你们自己去探索啦～

最后，这有可能是本站最后一篇博文了，当然前提是我能在这个寒假把新站摸出来，届时域名也会换新（摆脱穷酸的.ml)。（咕咕咕）

那么，我们下次再见啦～

注：本文图床Powered by 瓜瓜(@Augix)