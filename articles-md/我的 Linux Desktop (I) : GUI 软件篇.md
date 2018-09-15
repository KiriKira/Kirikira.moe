# 我的 Linux Desktop (I): GUI 软件篇

1. [桌面环境（DE): KDE, Cinnamon](#1)

2. [启动器（全局搜索）：Krunner, Albert](#2)

3. [终端：Konsole, Yakuake](#3)

4. [文件管理：Dolphin](#4)

5. [编辑器：VSCode](#5)

6. [浏览器：Chrome(Chromium), Firefox](#6)

7. [输入法：Fcitx-Rime](#7)

8. [聊天工具：Telegram-desktop, Tencent-QQ(AppImage)](#8)

9. [音乐播放器：Spotify, Netease-cloud-music，Rhythmbox](#9)

10. [视频播放器：MPV, VLC](#10)

11. [下载工具: Aria2(with AriaNG), Qbittorrent](#11)

12. [Office: WPS](#12)

13. [截图工具：Flameshot](#13)

14. [密码管理器：KeeWeb(KeepAss)](#14)

15. [游戏：Steam](#15)

16. [图像处理：GIMP](#16)

17. [GitHub 客户端：Github-Desktop(AppImage)](#17)

终于又到了暑假，想起去年暑假正是我开始接触 Linux 的时候，到现在也即将满一周年了。一年里，使用 Linux 从新鲜的尝试变成了日常的习惯，Linux 本身则从遥不可及的地位到了我的服务器上，随后又来到我的桌面。一年里，使用 Linux 作为主系统真的会改变一个人对软件与系统的要求和习惯，甚至于改变思维方式。

尚未接触 Linux 的人常会对 Linux 或者说 *nix 抱着一种敬畏甚至畏惧的态度，一如人们对黑客的印象就是一块黑色的屏幕上快速滚动的英文和键盘上翻飞的手指，而对外星人的印象就是乘坐圆形碟子的章鱼怪或者大眼睛的秃头巨婴。而实际上，作为桌面系统的 Linux 在无数开发者无私的贡献下已经非常简单易用，终端也不是只有黑白两色英文字母，而可以是高度可定制的活泼色彩。

题外话插一句，尽管一直没有人来问起，本博客的文章分类中有一个我自创的英文缩写， BABU —— 是 Be A Better User 的意思。我对自己的定位到目前为止一直都是“用户”，而非“开发者”。因此我也非常反感“Linux 只适合开发者”的说法，更加反对“有精力 Linux，有钱 MacOS，没钱没精力 Windows”的说法。对各个操作系统的看法在本文属于 #offtopic, 让我们先把它放一边吧~

作为一个用户，我对我的操作系统的软件有两点要求：一是优雅，二是信仰。

对我而言，优雅有着复杂的定义：

> 优雅
>
> adj.+v.
>
>
> 优雅意味着不将就，而绝不是不讲究。既然有更好的东西，那就不必死抱着过时简陋的东西将就下去；
>
> 优雅期望开箱即用(OOTB)的体验，但并不排斥一劳永逸的复杂配置；
>
> 优雅期望 GUI 胜过 CLI，即是说能用 GUI 方便地完成的任务就不会去打开终端，但同时完全接受用终端来完成 GUI 不足以应付的任务；
>
> 优雅期望赏心悦目的外观，期望偏向活泼的色彩，期望白色是纯粹的白而黑色则不应太过黯淡，期望现代化的组件设计而摒弃上世纪风格的设计；
>
> 跨平台是好文明；
>
> 优雅期望简洁直观的配置，但要求保有足够的配置能力，哪怕那些配置需要去修改源码的实现（这其实也是 RMS 对自由的定义之一）；
>
> 在上一条的基础上，可配置能力越强越好；
>
> 优雅期望直观的交互逻辑，这种逻辑应该以让人一眼能看出其用途为目标，应该以提高用户生产力为目标；对于同类的事物，对操作逻辑的要求则倾向于已熟悉的传统体验，例如 Windows > MacOS；
>
> 优雅拒绝千篇一律、千人一面，但这并非追求小众的意思；
>
> 优雅期望尽量少的依赖关系和尽量少的资源占用，但如果它能满足以上的各点要求的话，多吃点也无妨，例如设计优秀的 Electron 软件；
>
> 优雅倾向于自动化，尤其排斥重复的动作；
>
> 优雅同时对以上所有做出要求，但没有一条要求是强制性的，一切应当以实际的使用体验为优先考量。

从我对“优雅”的定义来看，你会知道我会拒绝繁琐的 LFS 等发行版，拒绝 UI 过于过时的软件，拒绝千人一面的 ios，拒绝依赖复杂的 Wine 等。

而“信仰”的定义则很简单，那就是自由与信任。自由是 RMS 所定义的自由，即软件的四项基本自由：自由运行软件、自由学习和修改软件源代码、自由再发布软件拷贝以及、自由发布修改后的软件版本[^1]。信任则是对软件作者的信任和对发行版维护者、开发者、打包人员等的信任，信任他们贡献的开源代码所给予我的自由，信任软件源提供的二进制软件。

说是“信仰”，其实倒没有那么坚定，在信任的范围内，闭源是可以接受的，毕竟在 Windows 上我用的可也大多是闭源软件呢（不对，Windows 这不整个就是闭源系统嘛）。极端的宗教就会成为邪教，信仰在合适的场景给优雅的体验让步是必须的。

那么话不多说了，开始介绍吧。本文主要的介绍对象是初次接触 Linux 的用户，因此基本都是些大众软件而且也不会介绍专业软件。如果有其他的选择和我没提到的有趣软件，也请务必介绍给我~

## <span id="1">[桌面环境（DE): KDE, Cinnamon](#1)</span>

![KDE](https://i.yusa.me/4buAXbE9WxQ1.png)
<center>KDE</center>

![Cinnamon](https://i.yusa.me/JBtKMmja24l4.png)
<center>Cinnamon</center>

在 GNU/Linux 系统中，桌面环境并不是与系统绑定的（而 Windows 和 MacOS 往往拿出来就能知道是 Windows 或 MacOS），而是多姿多彩、百家争鸣的，常见的桌面环境(DE)有 [KDE](https://www.kde.org/), [Gnome](https://www.gnome.org/), [Cinnamon](https://developer.linuxmint.com/projects/cinnamon-projects.html), [Xfce](https://xfce.org/) 等等，你还可以选择更为精简的 WM 比如 i3 等来代替完整的 DE 。

在这么多的选择之中，KDE 与 Gnome 是最为重量级的两位选手，都拥有着完善的软件生态、活跃的社区支持，当然还有较多的资源占用和较复杂的依赖关系。为了避免踩一捧一，我就只说 KDE 的好吧。

KDE 具有极高的可配置性，可以配的比 Gnome 更像 MacOS，也可以比 Cinnamon 更像 Windows (虽然为什么要让独特的 Linux 去模仿别的系统呢); KDE也具有很强的功能性，自带的软件非常好用，例如一会要介绍的 Krunner 和 Konsole, Dolphin 其实都只是 KDE 自带的而已。

在 5.13 的全局设置中支持毛玻璃（也即模糊透明或者 Blur）后，KDE 也在美观程度上把别的 DE 甩在了后面（主观评价请不要在意），许许多多炫酷的特效也是 Linux 独此一家别无分店。

而选择 Cinnamon 的理由就很简单了，因为 KDE 虽然太好用但是也太耗电了呀pmp，我需要一个特效少一点的 DE 来出门使用。另外 Cinnamon 也是我之前使用的 LinuxMint 的默认 DE（准确地说这就是 LinuxMint 开发的），它以追求传统的交互方式为目标来魔改 Gnome ，所以习惯 Windows 的人也会觉得 “这不是跟 Windows 差不多嘛”。一言以蔽之，稳定、高效、传统，这就是 Cinnamon。

如果你是第一次接触 Linux Desktop 并且不知道该如何选择的话，不要犹豫，选 KDE 吧。

## <span id="2">[启动器（全局搜索）：Krunner, Albert](#2)</span>

全局搜索是一类你用之前觉得“这有什么必要吗”，而在用习惯以后就“啊，已经是全局搜索的形状了”的小工具。一个优秀的全局搜索，可以将你硬盘每个角落的文件都搜索出来，你完全可以让它代替“主菜单”来启动软件，可以用它将你昨天没写完的文档打开，甚至连文档内的关键词都可以搜索，如图:

![Krunner](https://i.yusa.me/eGirNrmaMm4J.png)
<center>Krunner</center>

除了方便的搜索功能以外，还有一些扩展的功能，比方说，词典：

![Krunner](https://i.yusa.me/Brh8qXzn2xJo.png)
<center>Plasma-runners-translate(Krunner-plug-in)</center>

不过 Krunner 是 KDE 专属部件，其他 DE 就用不上了，但是我们还有些不错的替代品，例如 Albert, Ulauncher 等。

![Albert](https://i.yusa.me/QMH80RRgL2mo.png)
<center>Albert</center>

不过无论是 Krunner 还是 Albert，比起 Windows 上的 Listary 在细节上有所差距就是了。

## <span id="3">[终端：Konsole, Yakuake](#3)</span>

终端（模拟器）可以说是 Linux 必不可少的一部分，到目前为止，无论有谁吹自己家的 distro/DE 多么多么适合零基础的人，命令行都是逃不掉的一部分。

对终端其实我只有一个要求：好看就行了。实际上大部分终端长得都差不多一个样子，配色我会用自己配好的颜色。为了好看，大家往往还会给终端加上半透明或者背景，然而这两者都可能导致终端文字没有那么清晰。这时，Konsole 配合 KDE 的毛玻璃效果就非常惊艳了：

![Konsole](https://i.yusa.me/JqHAedNBJ4GB.png
)
<center>Konsole</center>

即使是纯白+半透明这样本来会亮瞎眼的搭配，再加上毛玻璃的效果以后既能让文字和背景区分清楚，又能使纯白的颜色没那么刺眼。

而 Yakuake 则是基于 Konsole 的下拉式终端，与普通的终端相比是一种船新的体验，设定好顺手的召唤快捷键以后非常容易上瘾，（我设置的是 Alt+Q）简直就跟 XP 时代疯狂 F5 刷新桌面一样啊www。

![Yakuake](https://i.yusa.me/d8hjBdJrYgdy.png)
<center>Yakuake</center>

顺带一提，在 Gnome 也有对应的 Guake 可以用。

## <span id="4">[文件管理：Dolphin](#4)</span>

文件管理这件事既离不开 GUI，也离不开 CLI，尤其是媒体文件的处理，有个缩略图会方便优雅的多。Linux 的文件管理器也是五花八门的，基本每一个 DE 都会写一个自己的文件管理器，有简洁的也有功能多的，不过也大同小异，而 KDE 自带的 Dolphin 也有着一个非常方便的特色功能，至少我还没有在同类软件中找到替代——跟随式终端。

![Dolphin](https://i.yusa.me/zzu9D03bPNvJ.png)
<center>Dolphin</center>

Dolphin 的终端可以在图形界面进入一个文件夹时自动跟进目录，反过来当终端里 cd 到一个目录时图形界面也会变更目录。对于免不了需要和命令行打交道的 Linux 系统来说，可以说如有神助了，比起频繁地“右键-在终端中打开”实在优雅的多。

刚刚查了一下 Nautilus 和 Nemo 倒是也有对应的插件可以实现，差点就说成这是 Dolphin 的专属功能了（

## <span id="5">[编辑器：VSCode](#5)</span>

每次提到编辑器，ide，编程语言之类的话题都势必变成一场大混战，实在是因人而异。VSCode 则是一款由微软出品的，与 Atom 一样基于 Electron 却比 Atom 要流畅许多的编辑器。我的选择是，在命令行简单编辑的时候使用 Vim，而写作/打码的时候则用 VSCode.

至少，我现在就在用 VSCode 来编写本文。

![VSCode](https://i.yusa.me/g2UYBmMYe8op.png)

## <span id="6">[浏览器：Chrome(Chromium), Firefox](#6)</span>

这其实也没啥好介绍的啦。因为个人习惯原因我更多的使用 Chrome(Chromium) 作为主浏览器，而 Firefox 则作为备胎使用。

## <span id="7">[输入法：Fcitx-Rime](#7)</span>

在中文输入法的问题上，Linux 并没有特别多的选择，无非是 Rime, libpinyin + Cloudpinyin, Sunpinyin 之类，而如果你不在意国产和闭源的话，还可以试试 sougoupinyin，但无论好不好用，Rime 都是开源拖拉机里唯一能用的了。

我之前也写了一篇文章，<https://kirikira.moe/post/20/>，所以这里就不再花笔墨介绍啦。

## <span id="8">[聊天工具：Telegram-desktop, Tencent-QQ(AppImage)](#8)</span>

Telegram 值得称道的一点就是它的跨平台及开源性，微信用户和 QQ 用户要想在 Linux 上愉快使用得费非常大的力气，使用 Wine 来用 Windows 版，封装网页版或者干脆直接使用网页版等，同时还要面临辣鸡腾讯封杀网页版的风险。国内大厂们可以说不但没点大厂风范，还可以说非常缺德了。

不过我还是留了一个封装好的 AppImage 版 Wine-qq 作为备用，不用装 Wine 来污染本地依赖环境也不需要复杂配置，双击打开就能用已经很方便了，不过其实我也几乎没打开过啦（

## <span id="9">[音乐播放器：Spotify, Netease-cloud-music，Rhythmbox](#9)</span>

一件令人欣喜的事是我喜欢用的两款在线音乐媒体都有原生的 Linux 客户端，尤其是作为国产软件的网易云音乐，肥肠感谢 deepin 所做的工作（虽然 bug 也常年不修就是了）。

而对本地音乐的播放器，则很遗憾的没有 Windows 上熟悉的 Foobar2000 就是了。作为替代，我选择 Rhythmbox, 这也是 Gnome 预装的软件之一。不过要我介绍其实也有点惭愧，毕竟我几乎没用上 rhy 的扩展功能（以上软件也基本没有介绍他们的扩展/插件），但仅仅作为一个普通的播放器是绰绰有余的。

![Rhythmbox](https://i.yusa.me/3wur9YwaBLle.png)
<center>Rhythmbox</center>

顺带一提，从 KDE5.13 开始，浏览器的媒体也可以与 KDE 媒体中心联动，也就是可以用系统的快捷键来控制浏览器里放着的音乐的播放暂停，可以说非常方便了。

## <span id="10">[视频播放器：MPV, VLC](#10)</span>

这俩都是开源且跨平台的著名软件，从界面上来说 MPV 相对简陋一点，但是功能性也更强一点，虽然更专业一些的东西我也不懂啦，不过反正确实有的视频用 MPV 顺畅打开而 VLC 就 GG 了。正因为其实毫无了解，所以我也没啥好介绍的啦。

## <span id="11">[下载工具: Aria2(with AriaNG), Qbittorrent](#11)</span>

把 Aria2 写进 GUI 软件里其实不太合适，不过实际上我用 Aria2 也基本上是用的 Aria2+Caddy+AriaNG 这样的 webui 搭配，所以也能勉强算进来啦。 Aria2 也是知名的跨平台开源下载软件，同时支持 HTTP/S, FTP, BT, Magnet 等，但它本身是一个没有界面的命令行工具，但我们可以通过 rpc 来和他交互，某些下载工具其实也就是 Aria2 的封装而已。

![AriaNG](https://i.yusa.me/Mof2PDR4B0e2.png)
<center>AriaNG</center>

然而，Aria2 并不是一个专业的 BT 软件，为了世界和平着想我们还需要一个可以下载 PT，同时支持 RSS 的 BT 软件，我应该也有写到过用 RSS 订阅来追番剧有多么方便。Qbittorrent 就是这么一个合适的 BT 工具，UI 也是挺可爱的。

![Qbittorrent](https://i.yusa.me/YlIGlrdLBqQz.png)
<center>Qbittorent</center>

## <span id="12">[Office: WPS](#12)</span>

在办公软件这方面，不得不承认的是除了 MS Office 真的是无可替代的软件之一，开源拖拉机们例如 LibreOffice 的兼容性真是难以启齿，然而在现实生活中却又几乎不可能完全脱离 MS Office。在这种时候，人们采取的解决方案有：双系统；双设备；虚拟机；Wine；其他同类软件；Ofiice Online 等。一些极端分子所提的“用 markdown 取代 Office”则完全是一笑而过的无稽之谈了。

如果要说同类软件的话，国人最容易想到的果然还是 WPS 了，所幸它还是有 Linux 版的，只不过与 Windows 版比起来还是有点不同就是了。

![WPS](https://i.yusa.me/OpsjE02RM91m.png)
<center>WPS</center>

## <span id="13">[截图工具：Flameshot](#13)</span>

在刚接触 Linux 的时候我就在期待 Snipaste(Windows 上肥肠好用的截图工具，后来有 MacOS 版移植，Linux 版正在开发中) 的 Linux 版，后来发现了 Flameshot 这个好东西，终于“此 Flame 乐，不思 Snipaste”。在接触好用的截图工具之前，往往会觉得“不就截个图吗，用系统自带的不就行了？”，而在接触后也会变成“已经是 xxx 的形状了”。

![Flameshot](https://i.yusa.me/NnhqOKL8OjrG.png)
<center>Flameshot</center>

从图中就可以看出了，Flameshot 可以在选中区域截图后打马赛克、做箭头之类的标记、画笔涂鸦、选择用某个软件打开、复制到剪贴板、保存为文件等，而且 UI 可爱，肥肠好用。

## <span id="14">[密码管理器：KeeWeb(KeepAss)](#14)</span>

在前面的文章中我也介绍过 KeepAss 这个开源的密码管理工具，而为它挑选客户端，我的要求是：长得好看；长得好看；支持 Webdav；最好能跨平台，这样我在 Windows 上就不用费心重挑了。

最后选择的就是 KeeWeb 这个 Electron 的客户端。

![KeeWeb](https://i.yusa.me/6MhRmEoG7no3.png)
<center>KeeWeb</center>

## <span id="15">[游戏：Steam](#15)</span>

这个就不用我介绍了吧。其实在使用 Linux 桌面之前，我已经做好了告别电脑游戏的准备，然而肥肠庆幸地发现其实许多游戏都有 Linux 版本，我的游戏库本来就不多，也有一半多支持 Linux。不需要特意切到 Windows 玩游戏真是太好啦。

## <span id="16">[图像处理：GIMP](#16)</span>

GIMP 相当于是 PS 的开源版，而就是在 GIMP 的开发中才有了 GTK 技术，也才有了如今的 Gnome 和一大堆 GTK 软件。但是我其实并不怎么会用 PS，也当然不怎么会 GIMP，所以也只能讲这么多啦。

## <span id="17">GitHub 客户端：Github-Desktop(AppImage)</span>

“GitHub(Git) 为什么还需要客户端？”

没错，确实不需要，确实是多此一举，但是我还就是挺喜欢这个东西的。把它放进这篇文章，也正是为了印证我对“优雅”的定义。如果你有所疑问的话，不如下一个 AppImage 试试，再来看看我所说的“优雅”。

![GitHub-Desktop](https://i.yusa.me/8eud2p7WlwXy.png)
<center>GitHub-Desktop</center>

本文所涉及的开源项目与闭源软件均列于下方：

[^1]:GNU: 什么是自由软件？ https://www.gnu.org/philosophy/free-sw.zh-cn.html 

* KDE : <https://www.kde.org>

* Cinnamon : <https://developer.linuxmint.com/projects/cinnamon-projects.html>

* Krunner : <https://userbase.kde.org/Plasma/Krunner>

* Albert : <https://github.com/albertlauncher/albert>

* Konsole : <https://konsole.kde.org/>

* Yakuake : <https://www.kde.org/applications/system/yakuake/>

* Guake : <https://github.com/Guake/guake>

* Dolphin : <https://userbase.kde.org/Dolphin/File_Management/>

* VSCode : <https://code.visualstudio.com/>

* Chromium : <https://www.chromium.org/>

* Firefex : <https://www.mozilla.org/>

* Fcitx : <https://fcitx-im.org>

* Rime : <https://rime.im/>

* Telegram-Desktop : <https://desktop.telegram.org/>

* Wine-QQ-Tim(AppImage) : <https://github.com/askme765cs/Wine-QQ-TIM>

* Spotify : <https://www.spotify.com/sg-en/download/linux/>

* Netease-cloud-music : <https://www.deepin.org/2017/11/17/netease-cloud-music-v1-1-for-linux-is-released/>

* Rhythmbox : <https://wiki.gnome.org/Apps/Rhythmbox>

* MPV : <https://mpv.io/>

* VLC : <https://www.videolan.org/vlc/>

* Aria2 : <https://aria2.github.io/>

* AriaNG : <https://github.com/mayswind/AriaNg>

* WPS : <https://www.wps.com/linux>

* Flameshot : <https://github.com/lupoDharkael/flameshot>

* KeeWeb : <https://keeweb.info/>

* Steam : <https://store.steampowered.com/linux>

* GIMP : <https://www.gimp.org/>

* Github-Desktop : <https://github.com/shiftkey/desktop>