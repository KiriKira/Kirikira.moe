Rime 初体验笔记
==============

*本文使用 Rime 写作*

用Linux当日常桌面已经有四个多月了,从 Ubuntu16.04+Gnome, 到 Ubuntu17.10+KDE, 再到 Mint18.3+Cinnamon,尽管对复杂命令和内部原理可以说一窍不通,不过姑且可以说是越来越得心应手,起码能满足日常使用需求了,有什么需求或者问题大部分也可以通过自己咕果+写脚本解决,可以说符合我对自己要求的BABU(Be A Better User)原则了.直到前天为止,还剩下两个另我头疼的问题:疑似在某次内核更新后,Mint的挂起会在长时间后无法恢复;另一个就是中文输入法的问题.

在此之前,我使用的输入法一直是 fcitx-googlepinyin,尽管比起自带的ibus-sunpinyin已经好了一些,而且有咕果信仰加成,不过由于咕果本身早已弃坑,咕果拼音就像是一个半身不遂的弃婴,各种地方的体验都比在Windows上时使用的搜狗输入法要相距甚远(当然,在Linux上你也可以用搜狗,不过既然在用Linux了我还是倾向于自由软件一点).主要的遗憾在以下几点:

* 词库超级不全.这当然一是多年没更新的锅,也是咕果拼音不支持云联想的结果(即使是持续更新的Android版,依然不支持)

* 在多年Windows+搜狗拼音的习惯上,我喜欢用`shift`键来切换中英文输入,而在我本想输入英文却忘了按`shift`切换的时候,先输完再按一样不会让我输入的内容白打.然而在用咕果拼音的时候,`shift`并不能起到这样的作用,那么就只能在fcitx里全局设置`shift`切换输入法来曲线救国了,可是这样就会导致我不小心输入的内容全部白打,可以说非常烦人了.

* 同样,我也习惯用 '<' 和 '>' 来对候选词翻页,但是咕果拼音却不支持,只能用`page up`和`page down`来翻页,这点真是对十几年习惯无情的摧残.

* 接触linux之后,日常生活里 写代码/敲命令 的频率明显变高了,这种时候符号的全角和半角就是一件很令人头疼的事情.比方说""和＂＂ ,  ，和,  ,明显不能混为一谈.(刚学C语言的时候就吃了不少亏)咕果似乎没有提供切换全半角的快捷键.另外,比如在用markdown写这篇文章的时候,markdown标记都需要用半角符号,即使用shift切换中/英文输入来输入半角符号再切回来,也是一件非常烦人的事情.

以上几点其实我觉得很可能是我不会用而可能可以通过某些方法设置,但总之菜菜的我算是受了不少的苦了.如果有打脸的答案,欢迎评论.于是压抑了这么久的时间之后,终于决定更换输入法.

我首先试了linpinyin, 那个体验真的是emmmmm.甚至在我用libpinyin输入"libpinyin真难用"的时候,出来的联想都是"男用"而不是"难用",实在是无力吐槽了.据说libpinyin搭配cloudpinyin之后体验会稍好一点,不过第一印象已经这样了就饶了我吧.

虽然我自称算是一个自由软件信徒,平时也是能用自由软件就尽量避免商业闭源软件,不过实际上我的信仰常常显得不那么坚定,尤其是挑选日常用软件的时候,开源软件常常看起来就像是一堆小厂生产的零件组装起来的"开源拖拉机".这张GNUCar就很形象:

![GNUcar](https://i.yusa.me/99upe3xp6746.jpg)

特别是在libpinyin之后的下一个输入法的选择上,这种害怕更甚了.于是我当时做的决定是:试一下 Rime,实在不行就还是sougou得了.万幸的是,我用不上这个"实在不行"的选项.

[Rime](http://rime.im/),中文名中州韻(韵)输入法,Windows版叫小狼毫（Weasel）,Mac版叫鼠须管（Squirrel）,Android版同文输入法（Trime）,iOS版iRime,是由[佛振](https://github.com/lotem)开发的开源输入法,从中文命名、[官网](http://rime.im)到[Wiki](https://github.com/rime/home/wiki),都是浓浓的中国风味.比如Wiki里面竟然直接[念起了诗](https://github.com/rime/home/wiki/MoodCollection):

>有詩為證
>
>讀書未成萬卷功  
>下筆竟似有神通  
>鍵盤乃可傳心意  
>信手探入法門中  
>
>式恕堂少主題中州韻輸入法引擎  
>庚寅年臘月十九日

嘿,这样的 Rime 正戳中了我喜欢自由软件的重要原因之一－－个性.我讨厌千人一面、讨厌千篇一律,所以我尤其讨厌iOS这样连图标都不能随便摆的系统(别说越狱,虽然我的苹果设备都是越狱的,但是这样我为什么不用Android呢?).而这样充满个性的 Rime ,可谓输入法里独一无二的存在了.

光在介绍里有个性当然还不够, Rime的高度可定制性也帮我解决了我在上面提到的咕果拼音遗留的问题.那么我们就开始简单体验以下Rime吧:

我用的输入法框架是fcitx,所以安装就是:

```bash
$sudo apt-get install fcitx-rime
```

安装之后就可以在fcitx里选择输入法为 Rime 了.而 Rime 的配置文件则在```~/.config/fcitx/rime/``` 里面,我们可以看到里面有许多的yaml文件,Rime的默认配置、用户设置和词库就保存在里面.

由于大陆人绝大部分时间都用的是简体字,因此我们使用```ctrl+`(Tab上面那个键)```然后切换到简体中文就好啦.

### 第一个需求:词库问题

我们惊喜地发现,Rime的词库也就是保存在路径里的yaml文件,那么一定是可以定制自己的词库的.先在```default.yaml```里面删掉不需要的schema:

```bash
$cd ~/.config/fcitx/rime/
$vim default.yaml
```

```ymal
schema_list:
   - schema: luna_pinyin
#  - schema: luna_pinyin_simp
#  将其他不需要的也全部注释/删除掉
```

在Rime吧里找到了别人做好的[词库](https://tieba.baidu.com/p/4125987751),下载然后解压,看着自己需要啥就丢进配置路径里去.可以看到```luna_pinyin.custom.yaml```里面有一项设置是:

```"translator/dictionary": luna_pinyin.extended```

因此我们就到```luna_pinyin.extended.dict.yaml```里看一下,里面就有一长串的词库列表.在里面选择自己需要的,将其他全部禁用:

```yaml
import_tables:
   - luna_pinyin
   #- luna_pinyin.extra_hanzi
   - luna_pinyin.sgmain
   - luna_pinyin.sgplus
   - luna_pinyin.sgplus2
   #- luna_pinyin.chat
   ...
```

最后,在系统托盘里的fcitx(输入法)图标处右键,选择重新部署Rime,词库就导入啦.导入词库后的部署可能会耗费比较多的时间,不用心急.

### 第二个需求额:`shift`切换大小写:

这个不需要任何设置,并且跟用咕果拼音的时候不小心按到`shift`就会导致刚刚打的白打了不一样,按`shift`并不会使已输入到中文输入框中的东西消失.

### 第三个需求:用 < 和 > 来翻页.

快捷键的设定也在```default.yaml```中,默认已经满足了.

### 第四个需求:更方便的全角半角设置

我希望的是:在中文模式时默认半角标点,而使用快捷键来随时切换全半角.后者后来发现在fcitx中就可以设置,不过我们也可以在```default.yaml```中对Rime进行设置.

前者的话,我们可以参考[官方的做法](https://gist.github.com/lotem/2334409),创建一个```alternative.yaml```:

<details>
<summary>alternative.yaml</summary>
<pre><code class="language-yaml">config_version: "0.3"

punctuator:
  full_shape:
    " " : { commit: "　" }
    "," : { commit: ， }
    "." : { commit: 。 }
    "&lt;" : [ 《, 〈, «, ‹ ]
    "&gt;" : [ 》, 〉, », › ]
    "/" : [ 、, ／, "/", ÷ ]
    "?" : { commit: ？ }
    ";" : { commit: ； }
    ":" : ：
    "'" : { pair: [ "‘", "’" ] }
    "\"" : { pair: [ "“", "”" ] }
    "\\" : [ 、, ＼, "\\" ]
    "|" : [ ・, ｜, "|", "§", "¦" ]
    "`" : [ ｀, "`" ]
    "~" : [ 〜, "~", ～, 〰 ]
    "!" : { commit: ！ }
    "@" : [ ＠, "@", ☯ ]
    "#" : [ ＃, "#", ⌘ ]
    "%" : [ ％, "%", "°", "℃" ]
    "$" : [ ￥, "$", "€", "£", "¥", "¢", "¤" ]
    "^" : { commit: …… }
    "&amp;" : [ ＆, "&amp;" ]
    "*" : [ ＊, "*", ・, ×, ※, ❂, · ]
    "(" : （
    ")" : ）
    "-" : [ －, "-" ]
    "_" : ——
    "+" : [ ＋, "+" ]
    "=" : [ ＝, "=" ]
    "[" : [ 「, 【, 〔, ［ ]
    "]" : [ 」, 】, 〕, ］ ]
    "{" : [ 『, 〖, ｛ ]
    "}" : [ 』, 〗, ｝ ]
  half_shape:
    "," : { commit: "," }
    "." : { commit: "." }
    "&lt;" : "&lt;"
    "&gt;" : "&gt;"
    "/" : "/"
    "?" : { commit: "?" }
    ";" : { commit: ";" }
    ":" : { commit: ":" }
    "'" : "'"
    "\"" : "\""
    "\\" : "\\"
    "|" : "|"
    "`" : "`"
    "~" : "~"
    "!" : { commit: "!" }
    "@" : "@"
    "#" : "#"
    "%" : "%"
    "$" : "$"
    "^" : "^"
    "&amp;" : "&amp;"
    "*" : "*"
    "(" : "("
    ")" : ")"
    "-" : "-"
    "_" : "_"
    "+" : "+"
    "=" : "="
    "[" : "["
    "]" : "]"
    "{" : "{"
    "}" : "}"

key_binder:
  bindings:
    # commonly used paging keys
    - { when: composing, accept: ISO_Left_Tab, send: Page_Up }
    - { when: composing, accept: Shift+Tab, send: Page_Up }
    - { when: composing, accept: Tab, send: Page_Down }
    - { when: has_menu, accept: minus, send: Page_Up }
    - { when: has_menu, accept: equal, send: Page_Down }
    - { when: paging, accept: comma, send: Page_Up }
    - { when: has_menu, accept: period, send: Page_Down }
</code></pre>
</details>

到这里, Rime 已经能基本满足我的日常需求啦.至于 Rime 还能给我带来怎样的惊喜,或是怎样的遗憾,就需要时间来检验了~~

参考资料:

* <https://github.com/rime/home/wiki/CustomizationGuide>

* <https://github.com/Chunlin-Li/Chunlin-Li.github.io/blob/master/blogs/linux/ubuntu-fcitx-rime.md>

* <http://tieba.baidu.com/p/4125987751>